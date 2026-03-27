"""
pipeline.py  —  Manufacturing QA  —  Backend Pipeline
======================================================
PipelineWorker  : runs YOLO + pose + GPT threads for one station.
PipelineManager : module-level registry of running workers (keyed by station_id).

Thread-to-async bridge
----------------------
The video and GPT threads write events into a thread-safe queue.Queue.
The async SSE endpoint drains that queue using asyncio.get_event_loop().run_in_executor
so it never blocks the event loop.

State available without SSE
----------------------------
worker.get_state()      → dict snapshot (alert, alert_type, blocked, last_completed_index, all_done)
worker.get_checklist()  → list[dict] (index, name, status)
"""

import os
import queue
import threading
import time
from typing import Dict, List, Optional

import cv2

from app.ai.action_detector import YoloPoseActionDetector
from app.ai.fusion import build_fusion_text, format_actions
from app.ai.gpt_vision import GptVisionInspector
from app.ai.sop_tracker import SOPState, SOPTracker
from app.ai.yolo_detector import YoloObjectDetector, draw_detections

# ── DEFAULT CONFIG ─────────────────────────────────────────────────────────────

_DEFAULTS = {
    "yolo_model_path": os.getenv("YOLO_MODEL", "yolo26l.pt"),
    "yolo_device":     os.getenv("YOLO_DEVICE", "cpu"),
    "yolo_imgsz":      int(os.getenv("YOLO_IMGSZ", "640")),
    "yolo_conf":       float(os.getenv("YOLO_CONF", "0.30")),
    "pose_model_path": os.getenv("POSE_MODEL", "yolo26l-pose.pt"),
    "pose_device":     os.getenv("POSE_DEVICE", "cpu"),
    "pose_imgsz":      int(os.getenv("POSE_IMGSZ", "640")),
    "pose_conf":       float(os.getenv("POSE_CONF", "0.30")),
    "gpt_model":       os.getenv("OPENAI_MODEL", "gpt-4o"),
    "target_objects":  [],   # empty → detect all COCO classes
    "yolo_interval":   1.2,  # seconds between YOLO runs
    "pose_interval":   0.25, # seconds between pose runs
    "gpt_interval":    2.0,  # seconds between GPT calls
    "video_w":         640,
    "video_h":         360,
    "gpt_jpeg_quality": 70,
    "connect_delay":    3.0, # seconds between RTSP retry attempts
}

_TAG = "[pipeline]"


# ── PIPELINE WORKER ────────────────────────────────────────────────────────────

class PipelineWorker:
    """
    Manages detection + GPT threads for a single station.

    Event queue items (consumed by the SSE endpoint):
        {"type": "gpt",       "parsed": dict, "state": SOPState}
        {"type": "checklist", "items": list}
        {"type": "error",     "msg": str}
        {"type": "end"}
    """

    def __init__(
        self,
        station_id: str,
        rtsp_url: str,
        sop_steps: List[str],
        safety_rules: Dict[int, List[str]],
        openai_api_key: str,
        config: Optional[dict] = None,
    ):
        self.station_id   = station_id
        self.rtsp_url     = rtsp_url
        self.sop_steps    = sop_steps
        self.safety_rules = safety_rules

        cfg = {**_DEFAULTS, **(config or {})}

        self.yolo = YoloObjectDetector(
            cfg["yolo_model_path"],
            cfg["target_objects"],
            device=cfg["yolo_device"],
            conf_threshold=cfg["yolo_conf"],
            imgsz=cfg["yolo_imgsz"],
        )
        self.pose = YoloPoseActionDetector(
            model_path=cfg["pose_model_path"],
            device=cfg["pose_device"],
            conf_threshold=cfg["pose_conf"],
            imgsz=cfg["pose_imgsz"],
            near_threshold_px=80,
        )
        self.inspector = GptVisionInspector(
            api_key=openai_api_key,
            model=cfg["gpt_model"],
        )
        self.tracker = SOPTracker(sop_steps)

        self._cfg = cfg

        self.event_queue: queue.Queue = queue.Queue()

        self._state_lock   = threading.Lock()
        self._latest_state: dict = {}

        self._sop_state_lock = threading.Lock()
        self._sop_state: Optional[SOPState] = None

        self._stop = threading.Event()
        self._video_thread: Optional[threading.Thread] = None
        self._gpt_thread:   Optional[threading.Thread] = None

        for idx in range(len(sop_steps)):
            self.safety_rules.setdefault(idx, [])

    # ── PUBLIC API ────────────────────────────────────────────────────────────

    def start(self) -> None:
        self._video_thread = threading.Thread(
            target=self._video_loop, daemon=True, name=f"pipeline-video-{self.station_id}"
        )
        self._gpt_thread = threading.Thread(
            target=self._gpt_loop, daemon=True, name=f"pipeline-gpt-{self.station_id}"
        )
        self._video_thread.start()
        self._gpt_thread.start()

    def stop(self) -> None:
        self._stop.set()

    def is_running(self) -> bool:
        if self._stop.is_set():
            return False
        vt = self._video_thread
        if vt is not None and not vt.is_alive():
            return False
        return True

    def get_state(self) -> dict:
        with self._sop_state_lock:
            s = self._sop_state
        running = self.is_running()
        if s is None:
            return {
                "running": running,
                "last_completed_index": -1,
                "alert": None,
                "alert_type": None,
                "blocked": False,
                "blocked_on_step": None,
                "all_done": False,
            }
        return {
            "running": running,
            "last_completed_index": s.last_completed_index,
            "alert": s.alert,
            "alert_type": s.alert_type,
            "blocked": s.blocked,
            "blocked_on_step": s.blocked_on_step,
            "all_done": s.all_done,
        }

    def get_checklist(self) -> List[dict]:
        return self.tracker.get_checklist()

    # ── VIDEO LOOP ────────────────────────────────────────────────────────────

    def _open_stream(self) -> Optional[cv2.VideoCapture]:
        """Try to open the RTSP stream, retrying indefinitely until stopped."""
        delay = float(self._cfg["connect_delay"])
        attempt = 0

        while not self._stop.is_set():
            attempt += 1
            cap = cv2.VideoCapture(self.rtsp_url)
            if cap.isOpened():
                print(f"{_TAG}[{self.station_id}] RTSP connected (attempt {attempt})")
                return cap
            cap.release()
            print(f"{_TAG}[{self.station_id}] RTSP not available, "
                  f"retry {attempt} in {delay:.0f}s…")
            time.sleep(delay)

        return None

    def _video_loop(self) -> None:
        cap = self._open_stream()
        if cap is None:
            self.event_queue.put({
                "type": "error",
                "msg": f"Cannot open stream after retries: {self.rtsp_url}",
            })
            self.event_queue.put({"type": "end"})
            return

        src_fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_delay = 1.0 / src_fps

        last_yolo_t = 0.0
        last_pose_t = 0.0
        last_detections = []
        last_hands      = []
        start_t = time.time()

        VIDEO_W = self._cfg["video_w"]
        VIDEO_H = self._cfg["video_h"]
        YOLO_INTERVAL = self._cfg["yolo_interval"]
        POSE_INTERVAL = self._cfg["pose_interval"]

        while not self._stop.is_set():
            t0 = time.perf_counter()
            ret, frame = cap.read()
            if not ret:
                print(f"{_TAG}[{self.station_id}] Stream read failed, reconnecting…")
                cap.release()
                cap = self._open_stream()
                if cap is None:
                    self.event_queue.put({
                        "type": "error",
                        "msg": f"Stream reconnect failed: {self.rtsp_url}",
                    })
                    break
                start_t = time.time()
                continue

            display = cv2.resize(frame, (VIDEO_W, VIDEO_H))
            now = time.time()
            ts  = now - start_t

            if now - last_yolo_t >= YOLO_INTERVAL:
                last_yolo_t = now
                last_detections = self.yolo.detect(display.copy())

            if now - last_pose_t >= POSE_INTERVAL:
                last_pose_t = now
                last_hands = self.pose.analyze(display.copy(), last_detections)

            draw_detections(display, last_detections)
            self.pose.draw_last_landmarks(display)

            fusion = build_fusion_text(last_detections, last_hands)

            gpt_frame = display.copy()
            h, w = gpt_frame.shape[:2]
            if w > 640:
                scale = 640 / w
                gpt_frame = cv2.resize(gpt_frame, (640, int(h * scale)))

            with self._state_lock:
                self._latest_state = {
                    "frame":      gpt_frame,
                    "fusion":     fusion,
                    "actions":    format_actions(last_hands),
                    "timestamp":  ts,
                    "detections": last_detections,
                }

            elapsed = time.perf_counter() - t0
            sleep_t = frame_delay - elapsed
            if sleep_t > 0:
                time.sleep(sleep_t)

        if cap is not None:
            cap.release()
        self.pose.close()
        self.event_queue.put({"type": "end"})

    # ── GPT LOOP ──────────────────────────────────────────────────────────────

    def _gpt_loop(self) -> None:
        GPT_INTERVAL = self._cfg["gpt_interval"]
        JPEG_QUALITY = self._cfg["gpt_jpeg_quality"]
        ok_streak: dict = {}

        while not self._stop.is_set():
            time.sleep(GPT_INTERVAL)

            with self._state_lock:
                snap = dict(self._latest_state)

            if not snap or snap.get("frame") is None:
                continue

            try:
                current_step_index = (
                    self.tracker.state.blocked_on_step
                    if self.tracker.state.blocked and self.tracker.state.blocked_on_step is not None
                    else self.tracker.last_completed_index + 1
                )
                current_step_safety = self.safety_rules.get(current_step_index, [])

                raw = self.inspector.inspect_frame(
                    frame_bgr=snap["frame"],
                    sop_steps=self.sop_steps,
                    fusion_text=snap["fusion"],
                    frame_time_sec=snap["timestamp"],
                    last_completed_index=self.tracker.last_completed_index,
                    jpeg_quality=JPEG_QUALITY,
                    current_step_safety=current_step_safety,
                )
                parsed = self.inspector.parse_response(raw)

                step_str = parsed["step"]
                status   = parsed["status"]

                if status == "OK":
                    ok_streak.setdefault(step_str, 0)
                    ok_streak[step_str] += 1
                    if ok_streak[step_str] < 2:
                        parsed = {**parsed, "status": "UNKNOWN",
                                  "reason": f"Confirming step {step_str} ({ok_streak[step_str]}/2)…"}
                else:
                    ok_streak.clear()

                state = self.tracker.update(
                    gpt_step=parsed["step"],
                    gpt_status=parsed["status"],
                    reason=parsed["reason"],
                )

                with self._sop_state_lock:
                    self._sop_state = state

                self.event_queue.put({
                    "type":   "gpt",
                    "parsed": parsed,
                    "state":  state,
                })
                self.event_queue.put({
                    "type":  "checklist",
                    "items": self.tracker.get_checklist(),
                })

            except Exception as exc:
                self.event_queue.put({
                    "type": "error",
                    "msg":  f"GPT error: {exc}",
                })


# ── PIPELINE MANAGER ──────────────────────────────────────────────────────────

_workers: Dict[str, PipelineWorker] = {}
_lock = threading.Lock()


def start(
    station_id: str,
    rtsp_url: str,
    sop_steps: List[str],
    safety_rules: Dict[int, List[str]],
    openai_api_key: str,
    config: Optional[dict] = None,
) -> PipelineWorker:
    with _lock:
        if station_id in _workers and _workers[station_id].is_running():
            raise RuntimeError(f"Pipeline already running for station {station_id}")

        worker = PipelineWorker(
            station_id=station_id,
            rtsp_url=rtsp_url,
            sop_steps=sop_steps,
            safety_rules=safety_rules,
            openai_api_key=openai_api_key,
            config=config,
        )
        worker.start()
        _workers[station_id] = worker
        return worker


def stop(station_id: str) -> None:
    with _lock:
        worker = _workers.pop(station_id, None)
    if worker:
        worker.stop()


def get(station_id: str) -> Optional[PipelineWorker]:
    return _workers.get(station_id)


def list_running() -> List[str]:
    with _lock:
        return [sid for sid, w in _workers.items() if w.is_running()]
