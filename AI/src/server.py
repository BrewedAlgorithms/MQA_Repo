"""
server.py — SSE HTTP server for Manufacturing QA
=================================================
Runs a FastAPI server alongside the Tkinter GUI in a background thread.

Endpoints:
    POST /sop     →  receive SOP config (required before pipeline starts)
    GET  /stream  →  text/event-stream
    GET  /health  →  liveness check

POST /sop body (JSON array):
    [
      {"title": "Wear cap",   "safety": []},
      {"title": "Take bottle","safety": ["Wear cap"]},
      ...
    ]

SSE events emitted on GET /stream:
    event: current_step
    data: <INT>       (1-based step number currently active)

    event: safety_err
    data: <STRING>    (safety / SOP-violation message)
"""

import asyncio
import threading
from typing import List, Set

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="MQA SSE Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── SOP CONFIG ────────────────────────────────────────────────────────────────

class SOPStep(BaseModel):
    title: str
    instructions: List[str] = []
    safety: List[str] = []


_sop_event: threading.Event = threading.Event()
_sop_steps: List[str] = []
_sop_safety: dict = {}


def wait_for_sop(timeout: float | None = None) -> bool:
    """Block until POST /sop has been received. Returns True when ready."""
    return _sop_event.wait(timeout=timeout)


def get_sop() -> tuple[List[str], dict]:
    """Return (steps, safety_map) set by POST /sop."""
    return _sop_steps, _sop_safety


@app.post("/sop", status_code=200)
def receive_sop(steps: List[SOPStep] = Body(...)):
    """
    Receive SOP configuration from the frontend.
    The pipeline will not start until this endpoint is called.

    Body: JSON array of step objects
        [{"title": "Wear cap", "safety": []}, ...]
    """
    global _sop_steps, _sop_safety

    if not steps:
        raise HTTPException(status_code=422, detail="SOP must contain at least one step.")

    _sop_steps = [s.title.strip() for s in steps]
    _sop_safety = {i: [r.strip() for r in s.safety if r.strip()] for i, s in enumerate(steps)}
    _sop_event.set()

    return {"status": "ok", "steps": len(_sop_steps)}


# ── BROADCASTER ───────────────────────────────────────────────────────────────

class SSEBroadcaster:
    """
    Thread-safe SSE broadcaster.

    Call push(event, data) from any thread (e.g. the GPT thread).
    Each connected /stream client receives the event asynchronously.
    """

    def __init__(self):
        self._queues: Set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def push(self, event: str, data: str) -> None:
        """Broadcast one SSE event to all connected clients (thread-safe)."""
        if self._loop is None or self._loop.is_closed():
            return
        payload = (event, data)
        for q in list(self._queues):
            asyncio.run_coroutine_threadsafe(q.put(payload), self._loop)

    def add_queue(self, q: asyncio.Queue) -> None:
        self._queues.add(q)

    def remove_queue(self, q: asyncio.Queue) -> None:
        self._queues.discard(q)


broadcaster = SSEBroadcaster()


# ── SSE ENDPOINT ──────────────────────────────────────────────────────────────

@app.get("/stream")
async def stream(request: Request):
    """
    Server-Sent Events endpoint.

    Example curl:
        curl -N http://localhost:8000/stream

    Example events:
        event: current_step
        data: 2

        event: safety_err
        data: Please wear helmet
    """
    async def event_generator():
        q: asyncio.Queue = asyncio.Queue()
        broadcaster.add_queue(q)
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"event: {event}\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive ping so proxies don't close the connection
                    yield ": keepalive\n\n"
        finally:
            broadcaster.remove_queue(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
