"""
pipeline.py  —  REST + SSE routes for the AI inspection pipeline.

All endpoints are scoped under /api/stations/{station_id}/pipeline.

POST   /start       — load station + latest SOP, start PipelineWorker
POST   /stop        — stop and remove the worker
POST   /restart     — stop (if running) then start a fresh pipeline
GET    /status      — current SOPState snapshot (JSON)
GET    /checkpoint  — full step checklist (JSON)
GET    /events      — SSE stream of real-time pipeline events
GET    /running     — list all station_ids with a running pipeline
"""

import asyncio
import json
import os
from typing import AsyncGenerator

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.ai import pipeline as mgr
from app.database import get_db

router = APIRouter(
    prefix="/api/stations",
    tags=["pipeline"],
)

_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _oid(station_id: str) -> ObjectId:
    try:
        return ObjectId(station_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid station_id")


async def _fetch_station(station_id: str) -> dict:
    db  = get_db()
    doc = await db.stations.find_one({"_id": _oid(station_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Station not found")
    return doc


async def _fetch_latest_sop(station_id: str) -> dict:
    db  = get_db()
    doc = await db.sops.find_one(
        {"station_id": station_id},
        sort=[("created_at", -1)],
    )
    if not doc:
        raise HTTPException(
            status_code=422,
            detail="No SOP found for this station. Upload one first.",
        )
    return doc


def _build_sop_data(sop_doc: dict):
    """Extract sop_steps list and safety_rules dict from a SOP document."""
    steps = sop_doc.get("steps", [])
    sop_steps    = [s["title"] for s in steps]
    safety_rules = {i: s.get("safety", []) for i, s in enumerate(steps)}
    return sop_steps, safety_rules


def _state_to_dict(state) -> dict:
    """Convert SOPState dataclass to a JSON-serialisable dict."""
    return {
        "last_completed_index": state.last_completed_index,
        "alert":                state.alert,
        "alert_type":           state.alert_type,
        "blocked":              state.blocked,
        "blocked_on_step":      state.blocked_on_step,
        "all_done":             state.all_done,
    }


# ── SSE event generator ───────────────────────────────────────────────────────

async def _sse_generator(station_id: str) -> AsyncGenerator[str, None]:
    """
    Drain the worker's event_queue and yield SSE-formatted strings.
    Uses run_in_executor so the blocking queue.get() never stalls the event loop.
    """
    worker = mgr.get(station_id)
    if worker is None:
        yield "data: " + json.dumps({"type": "error", "msg": "No pipeline running"}) + "\n\n"
        return

    loop = asyncio.get_event_loop()

    while worker.is_running():
        try:
            # 0.5 s timeout so we can check is_running periodically
            item = await loop.run_in_executor(
                None,
                lambda: worker.event_queue.get(timeout=0.5),
            )
        except Exception:
            # queue.Empty from timeout — loop back and check is_running
            continue

        if item["type"] == "gpt":
            payload = {
                "type":   "gpt",
                "parsed": item["parsed"],
                "state":  _state_to_dict(item["state"]),
            }
        elif item["type"] == "checklist":
            payload = {"type": "checklist", "items": item["items"]}
        elif item["type"] == "error":
            payload = {"type": "error", "msg": item["msg"]}
        elif item["type"] == "end":
            payload = {"type": "end"}
            yield "data: " + json.dumps(payload) + "\n\n"
            return
        else:
            continue

        yield "data: " + json.dumps(payload) + "\n\n"

    yield "data: " + json.dumps({"type": "end"}) + "\n\n"


# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@router.post(
    "/{station_id}/pipeline/start",
    status_code=200,
    summary="Start AI pipeline for a station",
    description=(
        "Loads the station's RTSP URL and its latest SOP from MongoDB, "
        "then starts the YOLO + pose + GPT inspection pipeline. "
        "Returns 409 if a pipeline is already running for this station. "
        "Returns 422 if the station has no RTSP URL or no SOP uploaded."
    ),
    tags=["pipeline"],
)
async def start_pipeline(station_id: str):
    if not _OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    station = await _fetch_station(station_id)

    rtsp_url = station.get("rtsp_url")
    if not rtsp_url:
        raise HTTPException(
            status_code=422,
            detail="Station has no RTSP URL. Set rtsp_url via PUT /api/stations/{id} first.",
        )

    existing = mgr.get(station_id)
    if existing and existing.is_running():
        raise HTTPException(status_code=409, detail="Pipeline already running for this station")

    sop_doc = await _fetch_latest_sop(station_id)
    sop_steps, safety_rules = _build_sop_data(sop_doc)

    if not sop_steps:
        raise HTTPException(status_code=422, detail="SOP has no steps. Add steps first.")

    try:
        mgr.start(
            station_id=station_id,
            rtsp_url=rtsp_url,
            sop_steps=sop_steps,
            safety_rules=safety_rules,
            openai_api_key=_OPENAI_API_KEY,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return {
        "status":     "started",
        "station_id": station_id,
        "rtsp_url":   rtsp_url,
        "sop_steps":  sop_steps,
    }


@router.post(
    "/{station_id}/pipeline/stop",
    status_code=200,
    summary="Stop AI pipeline for a station",
    description="Signals the running pipeline to stop and removes it from the manager.",
    tags=["pipeline"],
)
async def stop_pipeline(station_id: str):
    worker = mgr.get(station_id)
    if not worker:
        raise HTTPException(status_code=404, detail="No pipeline running for this station")

    mgr.stop(station_id)
    return {"status": "stopped", "station_id": station_id}


@router.post(
    "/{station_id}/pipeline/restart",
    status_code=200,
    summary="Restart AI pipeline for a station",
    description=(
        "Stops any running pipeline for this station, then starts a fresh one. "
        "Avoids the 409 race of calling stop-then-start separately."
    ),
    tags=["pipeline"],
)
async def restart_pipeline(station_id: str):
    if not _OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    station = await _fetch_station(station_id)

    rtsp_url = station.get("rtsp_url")
    if not rtsp_url:
        raise HTTPException(
            status_code=422,
            detail="Station has no RTSP URL. Set rtsp_url via PUT /api/stations/{id} first.",
        )

    existing = mgr.get(station_id)
    if existing and existing.is_running():
        mgr.stop(station_id)

    sop_doc = await _fetch_latest_sop(station_id)
    sop_steps, safety_rules = _build_sop_data(sop_doc)

    if not sop_steps:
        raise HTTPException(status_code=422, detail="SOP has no steps. Add steps first.")

    mgr.start(
        station_id=station_id,
        rtsp_url=rtsp_url,
        sop_steps=sop_steps,
        safety_rules=safety_rules,
        openai_api_key=_OPENAI_API_KEY,
    )

    return {
        "status":     "started",
        "station_id": station_id,
        "rtsp_url":   rtsp_url,
        "sop_steps":  sop_steps,
    }


@router.get(
    "/{station_id}/pipeline/status",
    summary="Get current SOP state",
    description=(
        "Returns a snapshot of the current SOPState for the station's running pipeline. "
        "Returns running: false when no pipeline is active."
    ),
    tags=["pipeline"],
)
async def pipeline_status(station_id: str):
    worker = mgr.get(station_id)
    if not worker:
        return {"running": False}

    return worker.get_state()


@router.get(
    "/{station_id}/pipeline/checkpoint",
    summary="Get full SOP checklist",
    description=(
        "Returns every SOP step with its current status: "
        "done | current | blocked | pending."
    ),
    tags=["pipeline"],
)
async def pipeline_checkpoint(station_id: str):
    worker = mgr.get(station_id)
    if not worker:
        raise HTTPException(status_code=404, detail="No pipeline running for this station")

    return {"station_id": station_id, "checklist": worker.get_checklist()}


@router.get(
    "/{station_id}/pipeline/events",
    summary="SSE stream of real-time pipeline events",
    description=(
        "Server-Sent Events stream. Each event is a JSON object with a `type` field:\n\n"
        "- `gpt`       — GPT inspection result + updated SOPState\n"
        "- `checklist` — full checklist update\n"
        "- `error`     — pipeline error message\n"
        "- `end`       — stream ended (pipeline stopped or video ended)\n\n"
        "Connect with `EventSource` in the browser or any SSE client."
    ),
    tags=["pipeline"],
)
async def pipeline_events(station_id: str):
    worker = mgr.get(station_id)
    if not worker:
        raise HTTPException(status_code=404, detail="No pipeline running for this station")

    return StreamingResponse(
        _sse_generator(station_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",    # disable nginx buffering
        },
    )


@router.get(
    "/pipeline/running",
    summary="List all stations with a running pipeline",
    description="Returns the station_ids of all currently active pipeline workers.",
    tags=["pipeline"],
)
async def running_pipelines():
    return {"running": mgr.list_running()}
