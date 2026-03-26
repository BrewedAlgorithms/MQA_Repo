from __future__ import annotations

import json
import queue
import time
from pathlib import Path
from typing import List

import cv2
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from main import PipelineWorker
from state_manager import pipeline_state


DEFAULT_VIDEO = Path(r"D:\PICT-IT\Hackhatons\MAnifacturing QA\Media\neha2.mp4")


class SopUpdateRequest(BaseModel):
    steps: List[str]


app = FastAPI(title="Manufacturing QA API", version="1.0.0")

_result_queue: queue.Queue = queue.Queue()
_worker: PipelineWorker | None = None
pipeline_running = False


def _resolve_source() -> str:
    if DEFAULT_VIDEO.exists():
        return str(DEFAULT_VIDEO)
    return "0"


def _consume_results() -> None:
    while True:
        try:
            item = _result_queue.get(timeout=1.0)
        except queue.Empty:
            continue

        if item.get("type") == "end":
            break


def frame_generator():
    while True:
        try:
            item = _result_queue.get(timeout=1)
        except Exception:
            continue

        if item.get("type") == "frame":
            frame = item["frame"]

            _, buffer = cv2.imencode(".jpg", frame)
            frame_bytes = buffer.tobytes()

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )


def event_generator():
    """Generate SSE formatted state updates whenever state changes."""
    last_state = None

    while True:
        current_state = {
            "goal": pipeline_state.goal,
            "current_step": pipeline_state.current_step,
            "step_completed": pipeline_state.step_completed,
            "message": pipeline_state.message,
            "suggestion": pipeline_state.suggestion,
        }

        if current_state != last_state:
            yield f"data: {json.dumps(current_state)}\n\n"
            last_state = current_state

        time.sleep(0.3)


@app.on_event("startup")
def startup_event() -> None:
    # Do not auto-start pipeline; use /start endpoint.
    pass


@app.on_event("shutdown")
def shutdown_event() -> None:
    global pipeline_running
    if _worker is not None:
        _worker.stop()
    pipeline_running = False
    _result_queue.put({"type": "end"})


@app.post("/start")
def start_pipeline():
    global _worker, pipeline_running

    if pipeline_running:
        return {"status": "already running"}

    _worker = PipelineWorker(source=_resolve_source(), result_queue=_result_queue)
    _worker.start()

    pipeline_running = True
    return {"status": "started"}


@app.post("/stop")
def stop_pipeline():
    global _worker, pipeline_running

    if _worker:
        _worker.stop()

    pipeline_running = False
    return {"status": "stopped"}


@app.get("/stream")
def stream():
    """Server-Sent Events endpoint for real-time state updates."""
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


@app.get("/video")
def video_feed():
    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/status")
def get_status():
    return {
        "goal": pipeline_state.goal,
        "current_step": pipeline_state.current_step,
        "step_completed": pipeline_state.step_completed,
        "message": pipeline_state.message,
        "suggestion": pipeline_state.suggestion,
    }


@app.get("/checklist")
def get_checklist():
    return pipeline_state.checklist


@app.post("/sop")
def set_sop(payload: SopUpdateRequest):
    pipeline_state.set_sop(payload.steps)
    if _worker is not None:
        _worker.set_sop(payload.steps)
    return {"ok": True, "sop_steps": payload.steps}
