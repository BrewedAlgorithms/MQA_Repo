"""
main.py  —  Manufacturing QA  —  Complete Pipeline
====================================================
Combines:
  - YOLOv8 object detection
  - MediaPipe pose / hand tracking
  - GPT-4o Vision SOP inspection  (fixed API call)
  - SOPTracker step order checking (NEW)
  - Tkinter GUI: video feed + SOP checklist + live alerts (NEW)

Run:
    python main.py --source 0              # webcam
    python main.py --source neha.mp4       # video file

ENV: D:\\PICT-IT\\Hackhatons\\MAnifacturing QA\\.env
     OPENAI_API_KEY=sk-...
"""

import argparse
import os
import queue
import sys
import threading
import time
from pathlib import Path
from typing import List
import tkinter as tk
from tkinter import font as tkfont

import cv2
from dotenv import load_dotenv
from PIL import Image, ImageTk

from action_detector import MediaPipeHandActionDetector
from fusion import build_fusion_text, format_actions
from gpt_vision import GptVisionInspector
from sop_tracker import SOPTracker
from video_source import parse_video_source
from yolo_detector import YoloObjectDetector, draw_detections, format_detections

# ══════════════════════════════════════════════════════════════════════════════
#  PATHS & ENV
# ══════════════════════════════════════════════════════════════════════════════

ENV_PATH = Path(r"D:\PICT-IT\Hackhatons\MAnifacturing QA\.env")
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    print("[ERROR] OPENAI_API_KEY not set. Exiting.")
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
#  SOP  (admin configures this list)
# ══════════════════════════════════════════════════════════════════════════════

# SOP_STEPS: List[str] = [
#     "wear helmet",
#     "wear wrist watch",
#     "remove wrist watch",
#     "pick up bottle",
#     "place bottle down",
#     "open laptop",
# ]
SOP_STEPS: List[str] = [
    "Open laptop",
    "open Book",
    "take and use blue spray Bottle",
    "keep the bottle on the table",
    "take green bottle ",
    "place bottle on table",
    "close laptop",
]

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════

YOLO_MODEL_PATH   = "yolov8n.pt"
TARGET_OBJECTS    = ["bottle", "laptop", "person", "cell phone",
                     "helmet", "watch", "book",]   # lowercase COCO names
POSE_INTERVAL     = 0.25   # seconds between pose updates
YOLO_INTERVAL     = 1.2    # seconds between YOLO runs
GPT_INTERVAL      = 3.0    # seconds between GPT calls

# GUI
VIDEO_W  = 720
VIDEO_H  = 405
PANEL_W  = 420
WIN_H    = 620

DARK_BG   = "#0d0d0f"
PANEL_BG  = "#111215"
ACCENT    = "#00e5ff"
ACCENT2   = "#ff6b35"
TEXT_MAIN = "#e8eaed"
TEXT_DIM  = "#6b7280"
COL_OK    = "#34d399"
COL_WARN  = "#fbbf24"
COL_ERR   = "#f87171"
COL_DONE  = "#34d399"
COL_SKIP  = "#f87171"
COL_CURR  = "#fbbf24"
COL_PEND  = "#4b5563"

# ══════════════════════════════════════════════════════════════════════════════
#  PIPELINE WORKER  (runs detectors + GPT in background threads)
# ══════════════════════════════════════════════════════════════════════════════

class PipelineWorker:
    """
    Manages the detection + GPT thread.
    Pushes results to result_queue for the GUI to consume.

    result_queue items are dicts:
        {"type": "frame",    "frame": bgr_array}
        {"type": "gpt",      "raw": str, "parsed": dict, "state": SOPState}
        {"type": "checklist","items": list}
        {"type": "error",    "msg": str}
        {"type": "end"}
    """

    def __init__(self, source: str, result_queue: queue.Queue):
        self.source       = source
        self.result_queue = result_queue
        self._stop        = threading.Event()
        self.running      = True

        # Detectors
        self.yolo    = YoloObjectDetector(YOLO_MODEL_PATH, TARGET_OBJECTS)
        self.pose    = MediaPipeHandActionDetector(near_threshold_px=80)
        self.inspector = GptVisionInspector(
            api_key=OPENAI_API_KEY,
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
        )
        self.tracker = SOPTracker(list(SOP_STEPS))
        from state_manager import pipeline_state
        pipeline_state.set_sop(self.tracker.steps)

        # Shared state between main loop and GPT thread
        self._state_lock    = threading.Lock()
        self._latest_state  = {}
        self._last_gpt_fusion = ""

    def set_sop(self, sop_list: List[str]) -> None:
        """Update SOP at runtime for tracker and GPT context."""
        self.tracker = SOPTracker(list(sop_list))
        from state_manager import pipeline_state
        pipeline_state.set_sop(self.tracker.steps)

    def start(self):
        self.running = True
        self._video_thread = threading.Thread(
            target=self._video_loop, daemon=True)
        self._gpt_thread = threading.Thread(
            target=self._gpt_loop, daemon=True)
        self._video_thread.start()
        self._gpt_thread.start()

    def stop(self):
        self.running = False
        self._stop.set()

    # ── VIDEO LOOP ────────────────────────────────────────────────────────────

    def _video_loop(self):
        parsed = parse_video_source(self.source)
        cap = cv2.VideoCapture(parsed)
        if not cap.isOpened():
            self.result_queue.put({"type": "error",
                                   "msg": f"Cannot open: {self.source}"})
            return

        src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_delay = 1.0 / src_fps

        last_pose_t = 0.0
        last_yolo_t = 0.0
        last_detections = []
        last_hands = []
        start_t = time.time()

        while not self._stop.is_set():
            t0 = time.perf_counter()
            ret, frame = cap.read()
            if not ret:
                # Loop video file; for webcam just end
                if str(parsed).isdigit() if isinstance(parsed, str) else isinstance(parsed, int):
                    break
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            display = cv2.resize(frame, (VIDEO_W, VIDEO_H))
            now = time.time()
            ts = now - start_t

            # YOLO
            if now - last_yolo_t >= YOLO_INTERVAL:
                last_yolo_t = now
                last_detections = self.yolo.detect(display.copy())

            # Pose
            if now - last_pose_t >= POSE_INTERVAL:
                last_pose_t = now
                proc = display.copy()
                last_hands = self.pose.analyze(proc, last_detections)

            # Draw overlays
            draw_detections(display, last_detections)
            self.pose.draw_last_landmarks(display)

            # Build fusion and push to GPT thread
            fusion = build_fusion_text(last_detections, last_hands)
            with self._state_lock:
                self._latest_state = {
                    "frame": display.copy(),
                    "fusion": fusion,
                    "actions": format_actions(last_hands),
                    "timestamp": ts,
                    "detections": last_detections,
                }

            # Push frame to GUI
            self.result_queue.put({"type": "frame", "frame": display.copy()})

            # Real-time pacing
            elapsed = time.perf_counter() - t0
            sleep_t = frame_delay - elapsed
            if sleep_t > 0:
                time.sleep(sleep_t)

        cap.release()
        self.pose.close()
        self.result_queue.put({"type": "end"})

    # ── GPT LOOP ──────────────────────────────────────────────────────────────

    def _gpt_loop(self):
        """Runs in its own thread. Calls GPT every GPT_INTERVAL seconds."""
        while not self._stop.is_set():
            time.sleep(GPT_INTERVAL)

            if not getattr(self, "running", True):
                continue

            with self._state_lock:
                snap = dict(self._latest_state)

            if not snap or snap.get("frame") is None:
                continue
            if snap["fusion"] == self._last_gpt_fusion:
                continue   # nothing changed — skip

            try:
                raw = self.inspector.inspect_frame(
                    frame_bgr=snap["frame"],
                    sop_steps=self.tracker.steps,
                    fusion_text=snap["fusion"],
                    frame_time_sec=snap["timestamp"],
                    last_completed_index=self.tracker.last_completed_index,
                    jpeg_quality=40,
                )
                parsed = self.inspector.parse_response(raw)
                self._last_gpt_fusion = snap["fusion"]

                # Update SOP tracker
                state = self.tracker.update(
                    gpt_step=parsed["step"],
                    gpt_status=parsed["status"],
                    reason=parsed["reason"],
                )
                from state_manager import pipeline_state
                pipeline_state.update_from_gpt(parsed, state)

                # Push results to GUI
                self.result_queue.put({
                    "type": "gpt",
                    "raw": raw,
                    "parsed": parsed,
                    "state": state,
                })
                self.result_queue.put({
                    "type": "checklist",
                    "items": self.tracker.get_checklist(),
                })

            except Exception as exc:
                self.result_queue.put({
                    "type": "error",
                    "msg": f"GPT error: {exc}",
                })


# ══════════════════════════════════════════════════════════════════════════════
#  TKINTER GUI
# ══════════════════════════════════════════════════════════════════════════════

class App(tk.Tk):
    def __init__(self, source: str):
        super().__init__()
        self.source = source
        self.title("Manufacturing QA  •  SOP Inspector")
        self.configure(bg=DARK_BG)
        self.resizable(False, False)

        self.result_queue = queue.Queue()
        self._photo = None

        self._build_ui()
        self._start_pipeline()
        self._poll()

    # ── UI ────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        total_w = VIDEO_W + PANEL_W + 3
        self.geometry(f"{total_w}x{WIN_H}")

        # Top bar
        bar = tk.Frame(self, bg=DARK_BG, height=40)
        bar.pack(fill="x")
        bar.pack_propagate(False)
        tk.Label(bar, text="⬡  MFG·QA  SOP INSPECTOR",
                 bg=DARK_BG, fg=ACCENT,
                 font=("Courier", 13, "bold")).pack(side="left", padx=16)
        self.status_lbl = tk.Label(bar, text="● STARTING",
                                   bg=DARK_BG, fg=TEXT_DIM,
                                   font=("Courier", 10))
        self.status_lbl.pack(side="right", padx=16)
        tk.Frame(self, bg=ACCENT, height=1).pack(fill="x")

        # Body
        body = tk.Frame(self, bg=DARK_BG)
        body.pack(fill="both", expand=True)

        # LEFT: video + alert
        left = tk.Frame(body, bg=DARK_BG)
        left.pack(side="left", fill="both")

        self.canvas = tk.Canvas(left, width=VIDEO_W, height=VIDEO_H,
                                bg="#000", highlightthickness=0)
        self.canvas.pack()

        # Alert box below video
        self.alert_frame = tk.Frame(left, bg=PANEL_BG,
                                    height=WIN_H - VIDEO_H - 41)
        self.alert_frame.pack(fill="both", expand=True)
        self.alert_frame.pack_propagate(False)

        tk.Label(self.alert_frame, text="ALERT",
                 bg=PANEL_BG, fg=TEXT_DIM,
                 font=("Courier", 9, "bold")).pack(anchor="w", padx=12, pady=(8,0))

        self.alert_lbl = tk.Label(
            self.alert_frame,
            text="Monitoring…",
            bg=PANEL_BG, fg=TEXT_MAIN,
            font=("Segoe UI", 11) if sys.platform == "win32"
                 else ("Helvetica Neue", 11),
            wraplength=VIDEO_W - 24,
            justify="left", anchor="nw",
        )
        self.alert_lbl.pack(fill="both", padx=12, pady=4)

        # GPT detail labels
        detail_f = tk.Frame(self.alert_frame, bg=PANEL_BG)
        detail_f.pack(fill="x", padx=12, pady=(0,4))
        self.step_lbl   = tk.Label(detail_f, text="STEP: —",
                                   bg=PANEL_BG, fg=TEXT_DIM,
                                   font=("Courier", 9))
        self.step_lbl.pack(anchor="w")
        self.reason_lbl = tk.Label(detail_f, text="REASON: —",
                                   bg=PANEL_BG, fg=TEXT_DIM,
                                   font=("Courier", 9),
                                   wraplength=VIDEO_W - 24, justify="left")
        self.reason_lbl.pack(anchor="w")
        self.action_lbl = tk.Label(detail_f, text="ACTION: —",
                                   bg=PANEL_BG, fg=COL_WARN,
                                   font=("Courier", 9, "bold"),
                                   wraplength=VIDEO_W - 24, justify="left")
        self.action_lbl.pack(anchor="w")

        # Separator
        tk.Frame(body, bg="#1e2028", width=3).pack(side="left", fill="y")

        # RIGHT: SOP checklist panel
        right = tk.Frame(body, bg=PANEL_BG, width=PANEL_W)
        right.pack(side="left", fill="both", expand=True)
        right.pack_propagate(False)

        tk.Label(right, text="SOP CHECKLIST",
                 bg=PANEL_BG, fg=TEXT_DIM,
                 font=("Courier", 9, "bold")).pack(anchor="w", padx=14, pady=(12,4))
        tk.Frame(right, bg="#1e2028", height=1).pack(fill="x")

        # Scrollable checklist area
        self.checklist_frame = tk.Frame(right, bg=PANEL_BG)
        self.checklist_frame.pack(fill="both", expand=True, padx=8, pady=8)

        # Build initial checklist rows
        self._checklist_rows = []
        for i, step in enumerate(SOP_STEPS):
            row = self._make_checklist_row(self.checklist_frame, i, step, "pending")
            self._checklist_rows.append(row)

        tk.Frame(right, bg="#1e2028", height=1).pack(fill="x")

        # Progress bar
        prog_f = tk.Frame(right, bg=PANEL_BG, height=40)
        prog_f.pack(fill="x")
        prog_f.pack_propagate(False)
        tk.Label(prog_f, text="Progress",
                 bg=PANEL_BG, fg=TEXT_DIM,
                 font=("Courier", 9)).pack(side="left", padx=14)
        self.progress_lbl = tk.Label(prog_f, text="0 / 6",
                                     bg=PANEL_BG, fg=TEXT_MAIN,
                                     font=("Courier", 9, "bold"))
        self.progress_lbl.pack(side="right", padx=14)

        # Canvas progress bar
        self.prog_canvas = tk.Canvas(right, bg=PANEL_BG, height=6,
                                     highlightthickness=0)
        self.prog_canvas.pack(fill="x", padx=14, pady=(0, 8))

    def _make_checklist_row(self, parent, index: int,
                             name: str, status: str) -> dict:
        """Create one SOP step row. Returns dict of widget refs for updates."""
        STATUS_CONFIGS = {
            "done":    ("✔", COL_DONE,  TEXT_DIM),
            "skipped": ("✘", COL_ERR,   COL_ERR),
            "current": ("▶", COL_CURR,  TEXT_MAIN),
            "pending": ("○", COL_PEND,  TEXT_DIM),
        }
        icon, icon_col, text_col = STATUS_CONFIGS.get(
            status, ("○", COL_PEND, TEXT_DIM))

        f = tk.Frame(parent, bg=PANEL_BG)
        f.pack(fill="x", pady=2)

        icon_lbl = tk.Label(f, text=icon, bg=PANEL_BG, fg=icon_col,
                            font=("Courier", 12, "bold"), width=2)
        icon_lbl.pack(side="left", padx=(4, 6))

        num_lbl = tk.Label(f, text=f"{index+1}.", bg=PANEL_BG, fg=TEXT_DIM,
                           font=("Courier", 10), width=3)
        num_lbl.pack(side="left")

        name_lbl = tk.Label(f, text=name, bg=PANEL_BG, fg=text_col,
                            font=("Segoe UI", 10) if sys.platform == "win32"
                                 else ("Helvetica Neue", 10),
                            anchor="w")
        name_lbl.pack(side="left", fill="x", expand=True)

        return {"frame": f, "icon": icon_lbl, "name": name_lbl,
                "icon_col": icon_col, "text_col": text_col}

    def _update_checklist(self, items: list):
        STATUS_CONFIGS = {
            "done":    ("✔", COL_DONE,  TEXT_DIM),
            "skipped": ("✘", COL_ERR,   COL_ERR),
            "current": ("▶", COL_CURR,  TEXT_MAIN),
            "pending": ("○", COL_PEND,  TEXT_DIM),
        }
        done_count = 0
        for item in items:
            i = item["index"]
            status = item["status"]
            if i >= len(self._checklist_rows):
                continue
            row = self._checklist_rows[i]
            icon, icon_col, text_col = STATUS_CONFIGS.get(
                status, ("○", COL_PEND, TEXT_DIM))
            row["icon"].config(text=icon, fg=icon_col)
            row["name"].config(fg=text_col)
            if status == "done":
                done_count += 1

        # Update progress
        total = len(SOP_STEPS)
        self.progress_lbl.config(text=f"{done_count} / {total}")
        self.prog_canvas.update_idletasks()
        w = self.prog_canvas.winfo_width()
        if w > 0:
            self.prog_canvas.delete("all")
            # Background track
            self.prog_canvas.create_rectangle(0, 0, w, 6,
                                              fill="#1e2028", outline="")
            # Fill
            fill_w = int(w * done_count / total) if total > 0 else 0
            if fill_w > 0:
                col = COL_DONE if done_count == total else COL_CURR
                self.prog_canvas.create_rectangle(0, 0, fill_w, 6,
                                                  fill=col, outline="")

    def _update_alert(self, state, parsed: dict):
        """Update the alert box based on SOPState and parsed GPT response."""
        alert_type = state.alert_type or "OK"
        alert_msg  = state.alert or "Monitoring…"

        color = {
            "OK":      COL_OK,
            "WARNING": COL_WARN,
            "ERROR":   COL_ERR,
        }.get(alert_type, TEXT_MAIN)

        self.alert_lbl.config(text=alert_msg, fg=color)

        step_str   = parsed.get("step", "—")
        reason_str = parsed.get("reason", "—")
        action_str = parsed.get("action", "—")

        self.step_lbl.config(  text=f"STEP: {step_str}")
        self.reason_lbl.config(text=f"REASON: {reason_str}")
        self.action_lbl.config(text=f"ACTION: {action_str}",
                               fg=COL_ERR if alert_type == "ERROR"
                                  else COL_WARN if alert_type == "WARNING"
                                  else COL_OK)

        # Flash alert frame background on error
        bg = "#1a0a0a" if alert_type == "ERROR" else \
             "#1a1500" if alert_type == "WARNING" else PANEL_BG
        self.alert_frame.config(bg=bg)
        self.alert_lbl.config(bg=bg)

    # ── PIPELINE ──────────────────────────────────────────────────────────────

    def _start_pipeline(self):
        self.worker = PipelineWorker(self.source, self.result_queue)
        self.worker.start()
        self.status_lbl.config(text="● LIVE", fg=COL_OK)

    # ── POLL ──────────────────────────────────────────────────────────────────

    def _poll(self):
        try:
            while True:
                item = self.result_queue.get_nowait()

                if item["type"] == "frame":
                    frame = item["frame"]
                    rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    img   = Image.fromarray(rgb)
                    photo = ImageTk.PhotoImage(img)
                    self.canvas.create_image(0, 0, anchor="nw", image=photo)
                    self._photo = photo   # prevent GC

                elif item["type"] == "gpt":
                    self._update_alert(item["state"], item["parsed"])
                    self.status_lbl.config(text="● ANALYSED", fg=ACCENT)

                elif item["type"] == "checklist":
                    self._update_checklist(item["items"])

                elif item["type"] == "error":
                    self.alert_lbl.config(
                        text=f"⚠ {item['msg']}", fg=COL_ERR)
                    self.status_lbl.config(text="● ERROR", fg=COL_ERR)

                elif item["type"] == "end":
                    self.status_lbl.config(text="● VIDEO ENDED", fg=TEXT_DIM)

        except queue.Empty:
            pass

        self.after(16, self._poll)   # ~60 fps UI refresh

    def on_close(self):
        self.worker.stop()
        self.destroy()


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def parse_args():
    p = argparse.ArgumentParser(
        description="Manufacturing QA — SOP Inspector")
    p.add_argument("--source", default="0",
                   help="Video file path or webcam index (default: 0)")
    return p.parse_args()


def main():
    args = parse_args()
    source = args.source

    # If numeric string → webcam
    if source.isdigit():
        print(f"[INFO] Using webcam {source}")
    else:
        if not Path(source).exists():
            # Try default video
            default = Path(r"D:\PICT-IT\Hackhatons\MAnifacturing QA\Media\Neha2.mp4")
            if default.exists():
                source = str(default)
                print(f"[INFO] Using default video: {source}")
            else:
                print(f"[ERROR] Video not found: {source}")
                sys.exit(1)
        print(f"[INFO] Using video: {source}")

    app = App(source=source)
    app.protocol("WM_DELETE_WINDOW", app.on_close)
    app.mainloop()


if __name__ == "__main__":
    main()