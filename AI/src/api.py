import asyncio
import json
import threading
from pathlib import Path
from typing import Dict, List, Optional

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from video_source import parse_video_source
from yolo_detector import Detection, YoloObjectDetector

BASE_DIR = Path(__file__).resolve().parent.parent

SOURCE_MAP: Dict[int, object] = {
    0: 0,
    1: 1,
    2: str(BASE_DIR / "Media" / "neha2.mp4"),
    3: str(BASE_DIR / "Media" / "neha3.mp4"),
    4: str(BASE_DIR / "Media" / "worker4.mp4"),
    5: str(BASE_DIR / "Media" / "worker5.mp4"),
}

def _resolve_yolo_model() -> Path:
    """Pick the preferred YOLO weights (yolo26l.pt), fallback to yolov8n.pt."""
    candidates = [
        BASE_DIR / "yolo26l.pt",
        Path(__file__).resolve().parent / "yolo26l.pt",
        BASE_DIR / "yolov8n.pt",
        Path(__file__).resolve().parent / "yolov8n.pt",
    ]
    for path in candidates:
        if path.exists():
            return path
    # Final fallback: keep last candidate even if missing so caller gets a clear error
    return candidates[-1]


YOLO_MODEL_PATH = _resolve_yolo_model()


class SourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: int = Field(..., description="Source selector: 0-5")

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: int) -> int:
        if value not in SOURCE_MAP:
            raise ValueError("Invalid source value")
        return value


class SOPItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    instructions: List[str]
    safety: List[str]
    startTime: str
    endTime: str

    @field_validator("title")
    @classmethod
    def non_empty_title(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("title is required")
        return value.strip()

    @field_validator("instructions")
    @classmethod
    def non_empty_instructions(cls, value: List[str]) -> List[str]:
        if not value:
            raise ValueError("instructions must be provided")
        cleaned = [item.strip() for item in value if str(item).strip()]
        if not cleaned:
            raise ValueError("instructions must contain at least one entry")
        return cleaned

    @field_validator("safety")
    @classmethod
    def safety_list(cls, value: List[str]) -> List[str]:
        return [item.strip() for item in value if str(item).strip()]

    @field_validator("startTime", "endTime")
    @classmethod
    def times_required(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("startTime/endTime are required")
        return value.strip()


class SOPUploadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    steps: List[SOPItem]

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, value: List[SOPItem]) -> List[SOPItem]:
        if not value:
            raise ValueError("steps must not be empty")
        return value


class VideoPipelineManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._frame_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._cap: Optional[cv2.VideoCapture] = None
        self._last_frame: Optional[object] = None
        self.running: bool = False
        self.detector = YoloObjectDetector(str(YOLO_MODEL_PATH), target_labels=[])
        self._sop_steps: List[Dict[str, object]] = self._default_sop()
        self._current_step_idx: int = 0
        self._state: Dict[str, object] = {}
        self._reset_state()

    def _default_sop(self) -> List[Dict[str, object]]:
        return [
            {
                "id": 1,
                "title": "Wear Cap",
                "instructions": ["Wear the safety cap properly before starting."],
                "safety": [],
                "startTime": "0:00",
                "endTime": "0:30",
            },
            {
                "id": 2,
                "title": "Pick Bottle",
                "instructions": ["Go near bottle and pick it."],
                "safety": ["Cap"],
                "startTime": "0:31",
                "endTime": "1:00",
            },
            {
                "id": 3,
                "title": "Remove Cap",
                "instructions": ["Open the bottle cap carefully."],
                "safety": [],
                "startTime": "1:01",
                "endTime": "1:30",
            },
        ]

    def _resolve_source(self, source_id: int) -> object:
        if source_id not in SOURCE_MAP:
            raise ValueError("Invalid source value")
        return SOURCE_MAP[source_id]

    def _reset_state(self) -> None:
        for step in self._sop_steps:
            step["status"] = "pending"
        self._current_step_idx = 0 if self._sop_steps else -1
        if self._current_step_idx >= 0:
            self._sop_steps[self._current_step_idx]["status"] = "in_progress"
        self._state = self._build_state_payload()
        with self._frame_lock:
            self._last_frame = None

    def _build_state_payload(self) -> Dict[str, object]:
        if self._current_step_idx < 0 or self._current_step_idx >= len(self._sop_steps):
            return {
                "current_step": None,
                "current_step_index": -1,
                "status": "pending",
                "action": "",
                "safety_ok": True,
                "safety_msg": "",
            }

        step = self._sop_steps[self._current_step_idx]
        status = step.get("status", "pending")
        action = self._instruction_for_step(step, status)
        safety_ok = status != "missed"
        safety_msg = "" if safety_ok else f"You skipped {step['title']}. Go back, pick the step before proceeding."
        return {
            "current_step": step["title"],
            "current_step_index": self._current_step_idx,
            "status": status,
            "action": action,
            "safety_ok": safety_ok,
            "safety_msg": safety_msg,
        }

    def _instruction_for_step(self, step: Dict[str, object], status: str) -> str:
        if status == "missed":
            return f"You skipped {step['title']}. Go back, pick the {step['title'].lower()} before proceeding."
        instructions = step.get("instructions") or []
        if instructions:
            return str(instructions[0])
        return f"Perform step: {step['title']}"

    def start(self, source_id: int) -> None:
        source = self._resolve_source(source_id)
        with self._lock:
            self._stop_locked()
            self._reset_state()
            self.running = True
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, args=(source,), daemon=True)
            self._thread.start()

    def _run(self, source: object) -> None:
        cap: Optional[cv2.VideoCapture] = None
        try:
            parsed = parse_video_source(source)
            cap = cv2.VideoCapture(parsed)
            self._cap = cap
            if not cap.isOpened():
                raise RuntimeError(f"Cannot open source: {source}")

            while not self._stop_event.is_set():
                ok, frame = cap.read()
                if not ok:
                    break

                detections = self.detector.detect(frame)
                self._draw_boxes_only(frame, detections)

                with self._frame_lock:
                    self._last_frame = frame.copy()
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                self._state["safety_ok"] = False
                self._state["safety_msg"] = str(exc)
        finally:
            if cap:
                cap.release()
            self._cap = None
            with self._lock:
                self.running = False
                self._stop_event.clear()

    def _draw_boxes_only(self, frame, detections: List[Detection]) -> None:
        for det in detections:
            x1, y1, x2, y2 = det.bbox_xyxy
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

    def stop(self) -> None:
        with self._lock:
            self._stop_locked()

    def _stop_locked(self) -> None:
        self.running = False
        self._stop_event.set()
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None
        self._stop_event.clear()
        with self._frame_lock:
            self._last_frame = None

    def set_sop(self, steps: List[SOPItem]) -> None:
        with self._lock:
            self._sop_steps = [step.model_dump() for step in steps]
            self._reset_state()

    def get_frame(self):
        with self._frame_lock:
            if self._last_frame is None:
                return None
            return self._last_frame.copy()

    def get_state(self) -> Dict[str, object]:
        with self._lock:
            return dict(self._state)

    def checkpoint(self) -> List[Dict[str, object]]:
        with self._lock:
            return [
                {"id": step["id"], "title": step["title"], "status": step.get("status", "pending")}
                for step in self._sop_steps
            ]


manager = VideoPipelineManager()
app = FastAPI()


def _frame_generator():
    while manager.running:
        frame = manager.get_frame()
        if frame is None:
            continue
        _, buffer = cv2.imencode(".jpg", frame)
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
        )


async def _event_generator():
    while True:
        try:
            data = manager.get_state()
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(3)
        except asyncio.CancelledError:
            break


@app.post("/start")
def start_stream(req: SourceRequest):
    try:
        manager.start(req.source)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid source value")
    return {"status": "started", "source": req.source}


@app.post("/stop")
def stop_stream():
    manager.stop()
    return {"status": "stopped"}


@app.get("/video")
def video_stream():
    return StreamingResponse(_frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/events")
async def sse_events():
    return StreamingResponse(_event_generator(), media_type="text/event-stream")


@app.get("/checkpoint")
def checkpoint():
    return {"steps": manager.checkpoint()}


@app.post("/upload-sop")
def upload_sop(payload: SOPUploadRequest):
    manager.set_sop(payload.steps)
    return {"status": "SOP uploaded", "total_steps": len(payload.steps)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
