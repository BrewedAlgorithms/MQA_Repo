import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from contextlib import asynccontextmanager

from app.database import connect_db, close_db, get_db
from app.routes import stations, sop, dev, pipeline
from app.ai import pipeline as pipeline_mgr


async def _auto_start_pipelines():
    """Start AI pipelines for every station that has both rtsp_url and an SOP."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        print("[auto-start] OPENAI_API_KEY not set — skipping pipeline auto-start")
        return

    db = get_db()
    async for station in db.stations.find({"rtsp_url": {"$nin": [None, ""]}}):
        station_id = str(station["_id"])
        rtsp_url = station.get("rtsp_url")
        if not rtsp_url:
            continue

        sop_doc = await db.sops.find_one(
            {"station_id": station_id},
            sort=[("created_at", -1)],
        )
        if not sop_doc:
            print(f"[auto-start] {station.get('name', station_id)}: no SOP — skipped")
            continue

        steps = sop_doc.get("steps", [])
        sop_steps = [s["title"] for s in steps]
        if not sop_steps:
            print(f"[auto-start] {station.get('name', station_id)}: SOP has no steps — skipped")
            continue

        safety_rules = {i: s.get("safety", []) for i, s in enumerate(steps)}

        try:
            pipeline_mgr.start(
                station_id=station_id,
                rtsp_url=rtsp_url,
                sop_steps=sop_steps,
                safety_rules=safety_rules,
                openai_api_key=api_key,
            )
            print(f"[auto-start] {station.get('name', station_id)}: pipeline started "
                  f"({rtsp_url}, {len(sop_steps)} steps)")
        except Exception as exc:
            print(f"[auto-start] {station.get('name', station_id)}: FAILED — {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await _auto_start_pipelines()
    yield
    for sid in pipeline_mgr.list_running():
        pipeline_mgr.stop(sid)
    await close_db()


_DESCRIPTION = """
## MQA Backend API

Core REST API for the **Manufacturing Quality Assurance** platform.

### Capabilities

* **Stations** — manage named manufacturing stations that group SOP documents.
* **SOP Processing** — upload raw SOP text; GPT-4o-mini extracts structured steps and persists them to MongoDB.
* **Step Management** — add, edit, or remove individual steps from any processed SOP document.

### Interactive docs
| UI | URL |
|----|-----|
| Swagger UI | [`/docs`](/docs) |
| ReDoc | [`/redoc`](/redoc) |
| OpenAPI JSON | [`/openapi.json`](/openapi.json) |
"""

_TAGS = [
    {
        "name": "health",
        "description": "Service liveness probe.",
    },
    {
        "name": "stations",
        "description": (
            "CRUD operations for manufacturing stations. "
            "Each station acts as a logical container for one or more SOP documents. "
            "Deleting a station cascades to all its SOPs."
        ),
    },
    {
        "name": "sop",
        "description": (
            "SOP document processing and step-level management. "
            "**POST /api/sop/process** sends raw SOP text to OpenAI for structured extraction "
            "and stores the result in MongoDB. Individual steps can then be added, edited, or deleted."
        ),
    },
    {
        "name": "pipeline",
        "description": (
            "AI inspection pipeline management. "
            "Start or stop the YOLO + GPT-4o Vision SOP enforcement pipeline for a station. "
            "Query live SOP state, step checklist, or subscribe to real-time SSE events."
        ),
    },
]

app = FastAPI(
    title="MQA Backend",
    version="1.0.0",
    description=_DESCRIPTION,
    openapi_tags=_TAGS,
    contact={
        "name": "Titanium Forge — MQA Team",
    },
    license_info={
        "name": "Proprietary",
    },
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stations.router)
app.include_router(sop.router)
app.include_router(dev.router)
app.include_router(pipeline.router)


@app.get(
    "/health",
    tags=["health"],
    summary="Health check",
    description="Returns `{\"status\": \"ok\"}` when the service is running.",
    response_description="Service is healthy",
)
async def health():
    return {"status": "ok"}
