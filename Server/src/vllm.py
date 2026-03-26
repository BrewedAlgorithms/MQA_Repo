"""
Real-Time Video LLM Narrator  —  Manufacturing QA Edition
==========================================================
  LEFT  panel  : live video feed from neha.mp4
  RIGHT panel  : streaming GPT-4o narration (PAST / NOW / GOAL)

Target latency : 1.5 – 2.0 s  (down from ~4 s)

LATENCY FIXES APPLIED:
  1. Resize  640×360 → 512×288          saves ~0.2s upload
  2. JPEG quality  60 → 40              saves ~0.15s upload  (~12–18 KB/frame)
  3. detail="low" (was already set)     85-token fixed image cost
  4. History removed from prompt        saves ~300ms input processing
  5. max_tokens  120 → 60               cuts generation time ~50%
  6. Async streaming + thread reader    no blocking I/O

INSTALL:
  pip install opencv-python openai pillow python-dotenv

RUN:
  python video_llm_narrator.py
"""

import asyncio
import base64
import os
import queue
import sys
import threading
import time
from collections import deque
from io import BytesIO
from pathlib import Path
import tkinter as tk

import cv2
from PIL import Image, ImageTk
from openai import AsyncOpenAI
from dotenv import load_dotenv

# ══════════════════════════════════════════════════════════════════════════════
#  PATHS
# ══════════════════════════════════════════════════════════════════════════════

ENV_PATH   = Path(r"D:\PICT-IT\Hackhatons\MAnifacturing QA\.env")
VIDEO_PATH = Path(r"D:\PICT-IT\Hackhatons\MAnifacturing QA\Media\neha.mp4")

# ══════════════════════════════════════════════════════════════════════════════
#  LOAD .env
# ══════════════════════════════════════════════════════════════════════════════

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    print(f"[WARNING] .env not found at {ENV_PATH} — trying system env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    print("[ERROR] OPENAI_API_KEY not set. Exiting.")
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG  — tuned for 1.5–2 s latency
# ══════════════════════════════════════════════════════════════════════════════

FRAMES_PER_SECOND_TARGET = 1      # 1 frame/sec sent to GPT
JPEG_QUALITY             = 40     # ⬇ was 60  →  ~12–18 KB per frame
API_RESIZE_W             = 512    # ⬇ was 640
API_RESIZE_H             = 288    # ⬇ was 360
MAX_TOKENS               = 60     # ⬇ was 120  →  1 short sentence per label
MODEL                    = "gpt-4o"

# GUI
GUI_VIDEO_W = 760
GUI_VIDEO_H = 428
PANEL_W     = 460
WINDOW_H    = 560

# No history in prompt — saves ~300 ms of input processing
SYSTEM_PROMPT = (
    "You are a real-time manufacturing quality analyst. "
    "Reply with exactly THREE lines, no extra text:\n"
    "PAST: one short sentence on what just happened.\n"
    "NOW:  one short sentence on the current action in this frame.\n"
    "GOAL: one short sentence predicting the next step or flagging an anomaly."
)

# ══════════════════════════════════════════════════════════════════════════════
#  FRAME ENCODING
# ══════════════════════════════════════════════════════════════════════════════

def encode_frame_for_api(frame_bgr) -> str:
    """512×288 JPEG at quality=40 → ~12–18 KB → fast upload."""
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    img = Image.fromarray(rgb).resize((API_RESIZE_W, API_RESIZE_H), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def frame_to_photoimage(frame_bgr, w: int, h: int) -> ImageTk.PhotoImage:
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    img = Image.fromarray(rgb).resize((w, h), Image.LANCZOS)
    return ImageTk.PhotoImage(img)

# ══════════════════════════════════════════════════════════════════════════════
#  GPT-4o STREAMING CALL
# ══════════════════════════════════════════════════════════════════════════════

async def call_gpt_stream(client: AsyncOpenAI, b64_frame: str,
                          token_cb, done_cb):
    """
    No history in the prompt — keeps input tokens minimal.
    max_tokens=60 keeps generation fast.
    detail='low' pins image cost to 85 tokens regardless of resolution.
    """
    user_content = [
        {"type": "text", "text": "Narrate the current frame."},
        {"type": "image_url",
         "image_url": {
             "url": f"data:image/jpeg;base64,{b64_frame}",
             "detail": "low"      # 85-token fixed cost — fastest vision mode
         }},
    ]

    full = []
    t0   = time.perf_counter()
    try:
        stream = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            max_tokens=MAX_TOKENS,   # 60 tokens — short, fast
            temperature=0.3,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full.append(delta)
                token_cb(delta)
    except Exception as exc:
        token_cb(f"\n[API error: {exc}]")

    done_cb("".join(full), time.perf_counter() - t0)

# ══════════════════════════════════════════════════════════════════════════════
#  LLM WORKER  (own thread + event loop)
# ══════════════════════════════════════════════════════════════════════════════

class LLMWorker(threading.Thread):
    def __init__(self, api_queue: queue.Queue, token_queue: queue.Queue):
        super().__init__(daemon=True)
        self.api_queue   = api_queue
        self.token_queue = token_queue
        self.client      = AsyncOpenAI(api_key=OPENAI_API_KEY)

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._consume())

    async def _consume(self):
        while True:
            try:
                item = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.api_queue.get(timeout=15)
                )
            except queue.Empty:
                continue

            if item is None:
                self.token_queue.put(("end", "", 0))
                return

            self.token_queue.put(("new_frame", "", 0))

            await call_gpt_stream(
                self.client, item,
                token_cb = lambda t: self.token_queue.put(("token", t, 0)),
                done_cb  = lambda full, lat: self.token_queue.put(
                    ("done_stream", full, lat))
            )

# ══════════════════════════════════════════════════════════════════════════════
#  VIDEO READER  (background thread)
# ══════════════════════════════════════════════════════════════════════════════

class VideoReader(threading.Thread):
    def __init__(self, display_queue: queue.Queue, api_queue: queue.Queue):
        super().__init__(daemon=True)
        self.display_queue = display_queue
        self.api_queue     = api_queue
        self._stop         = threading.Event()

    def run(self):
        cap = cv2.VideoCapture(str(VIDEO_PATH))
        if not cap.isOpened():
            print(f"[ERROR] Cannot open: {VIDEO_PATH}")
            self.display_queue.put(None)
            self.api_queue.put(None)
            return

        src_fps  = cap.get(cv2.CAP_PROP_FPS) or 30.0
        api_skip = max(1, int(src_fps / FRAMES_PER_SECOND_TARGET))
        delay    = 1.0 / src_fps
        idx      = 0

        total   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        dur_sec = total / src_fps
        size_kb = API_RESIZE_W * API_RESIZE_H * JPEG_QUALITY // 6000
        print(f"[INFO] {VIDEO_PATH.name} | {src_fps:.1f} FPS | {dur_sec:.1f}s")
        print(f"[INFO] API frame: {API_RESIZE_W}×{API_RESIZE_H} "
              f"quality={JPEG_QUALITY} (~{size_kb}KB) every {api_skip} frames")

        while not self._stop.is_set():
            t0 = time.perf_counter()
            ret, frame = cap.read()
            if not ret:
                break

            try:
                self.display_queue.put_nowait(frame.copy())
            except queue.Full:
                try: self.display_queue.get_nowait()
                except queue.Empty: pass
                self.display_queue.put_nowait(frame.copy())

            if idx % api_skip == 0:
                encoded = encode_frame_for_api(frame)
                try:
                    self.api_queue.put_nowait(encoded)
                except queue.Full:
                    try: self.api_queue.get_nowait()
                    except queue.Empty: pass
                    self.api_queue.put_nowait(encoded)

            idx += 1
            sleep_t = delay - (time.perf_counter() - t0)
            if sleep_t > 0:
                time.sleep(sleep_t)

        cap.release()
        self.display_queue.put(None)
        self.api_queue.put(None)

    def stop(self):
        self._stop.set()

# ══════════════════════════════════════════════════════════════════════════════
#  TKINTER GUI
# ══════════════════════════════════════════════════════════════════════════════

class App(tk.Tk):
    DARK_BG   = "#0d0d0f"
    PANEL_BG  = "#111215"
    ACCENT    = "#00e5ff"
    ACCENT2   = "#ff6b35"
    TEXT_MAIN = "#e8eaed"
    TEXT_DIM  = "#6b7280"
    PAST_COL  = "#a78bfa"
    NOW_COL   = "#34d399"
    GOAL_COL  = "#fbbf24"
    GOOD_LAT  = "#34d399"   # green  ≤ 2 s
    WARN_LAT  = "#fbbf24"   # yellow ≤ 3 s
    BAD_LAT   = "#ff6b35"   # orange > 3 s

    def __init__(self):
        super().__init__()
        self.title("Manufacturing QA  •  Live Video Analyst")
        self.configure(bg=self.DARK_BG)
        self.resizable(False, False)

        self.display_queue = queue.Queue(maxsize=2)
        self.api_queue     = queue.Queue(maxsize=4)
        self.token_queue   = queue.Queue()

        self._frame_count = 0
        self._photo       = None
        self._raw_buf     = ""

        self._build_ui()
        self._start_workers()
        self._poll_display()
        self._poll_tokens()

    # ── BUILD UI ──────────────────────────────────────────────────────────────

    def _build_ui(self):
        total_w = GUI_VIDEO_W + PANEL_W + 3
        self.geometry(f"{total_w}x{WINDOW_H}")

        # top bar
        bar = tk.Frame(self, bg=self.DARK_BG, height=38)
        bar.pack(fill="x", side="top")
        bar.pack_propagate(False)
        tk.Label(bar, text="⬡  MFG·QA ANALYST",
                 bg=self.DARK_BG, fg=self.ACCENT,
                 font=("Courier", 13, "bold")).pack(side="left", padx=16, pady=6)
        self.status_lbl = tk.Label(bar, text="● INITIALISING",
                                   bg=self.DARK_BG, fg=self.TEXT_DIM,
                                   font=("Courier", 10))
        self.status_lbl.pack(side="right", padx=16)
        tk.Frame(self, bg=self.ACCENT, height=1).pack(fill="x")

        # body
        body = tk.Frame(self, bg=self.DARK_BG)
        body.pack(fill="both", expand=True)

        # LEFT: video
        left = tk.Frame(body, bg=self.DARK_BG)
        left.pack(side="left", fill="both")
        self.canvas = tk.Canvas(left, width=GUI_VIDEO_W, height=GUI_VIDEO_H,
                                bg="#000", highlightthickness=0)
        self.canvas.pack()
        info = tk.Frame(left, bg=self.PANEL_BG, height=30)
        info.pack(fill="x")
        info.pack_propagate(False)
        self.frame_lbl = tk.Label(info, text="Frame  —",
                                  bg=self.PANEL_BG, fg=self.TEXT_DIM,
                                  font=("Courier", 9))
        self.frame_lbl.pack(side="left", padx=10)
        self.lat_lbl = tk.Label(info, text="Latency  —",
                                bg=self.PANEL_BG, fg=self.TEXT_DIM,
                                font=("Courier", 9))
        self.lat_lbl.pack(side="right", padx=10)

        # separator
        tk.Frame(body, bg="#1e2028", width=3).pack(side="left", fill="y")

        # RIGHT: narration panel
        right = tk.Frame(body, bg=self.PANEL_BG, width=PANEL_W)
        right.pack(side="left", fill="both", expand=True)
        right.pack_propagate(False)

        ph = tk.Frame(right, bg=self.PANEL_BG, height=36)
        ph.pack(fill="x")
        ph.pack_propagate(False)
        tk.Label(ph, text="LIVE NARRATION",
                 bg=self.PANEL_BG, fg=self.TEXT_DIM,
                 font=("Courier", 9, "bold")).pack(side="left", padx=14, pady=10)
        self.thinking_lbl = tk.Label(ph, text="",
                                     bg=self.PANEL_BG, fg=self.ACCENT2,
                                     font=("Courier", 9, "italic"))
        self.thinking_lbl.pack(side="right", padx=14)
        tk.Frame(right, bg="#1e2028", height=1).pack(fill="x")

        sf = tk.Frame(right, bg=self.PANEL_BG)
        sf.pack(fill="both", expand=True, padx=14, pady=10)
        self.past_box = self._section(sf, "◈  PAST", self.PAST_COL)
        self.now_box  = self._section(sf, "◉  NOW",  self.NOW_COL)
        self.goal_box = self._section(sf, "◎  GOAL", self.GOAL_COL)

        # raw stream strip
        tk.Frame(right, bg="#1e2028", height=1).pack(fill="x")
        rh = tk.Frame(right, bg=self.PANEL_BG, height=24)
        rh.pack(fill="x")
        rh.pack_propagate(False)
        tk.Label(rh, text="RAW STREAM",
                 bg=self.PANEL_BG, fg=self.TEXT_DIM,
                 font=("Courier", 8)).pack(side="left", padx=14)
        self.stream_var = tk.StringVar(value="")
        tk.Label(right, textvariable=self.stream_var,
                 bg=self.PANEL_BG, fg="#3d4451",
                 font=("Courier", 8),
                 wraplength=PANEL_W - 28, justify="left",
                 anchor="nw").pack(fill="x", padx=14, pady=(0, 8))

    def _section(self, parent, title, color):
        f = tk.Frame(parent, bg=self.PANEL_BG)
        f.pack(fill="x", pady=(0, 10))
        tk.Label(f, text=title, bg=self.PANEL_BG, fg=color,
                 font=("Courier", 10, "bold")).pack(side="top", anchor="w")
        lbl = tk.Label(f, text="Waiting…",
                       bg=self.PANEL_BG, fg=self.TEXT_MAIN,
                       font=("Segoe UI", 10) if sys.platform == "win32"
                            else ("Helvetica Neue", 11),
                       wraplength=PANEL_W - 28, justify="left", anchor="nw")
        lbl.pack(fill="x", pady=(4, 0))
        return lbl

    # ── WORKERS ───────────────────────────────────────────────────────────────

    def _start_workers(self):
        self.video_reader = VideoReader(self.display_queue, self.api_queue)
        self.video_reader.start()
        self.llm_worker = LLMWorker(self.api_queue, self.token_queue)
        self.llm_worker.start()

    # ── DISPLAY POLL ──────────────────────────────────────────────────────────

    def _poll_display(self):
        try:
            frame = self.display_queue.get_nowait()
            if frame is None:
                self.status_lbl.config(text="● VIDEO ENDED", fg=self.ACCENT2)
                return
            self._frame_count += 1
            photo = frame_to_photoimage(frame, GUI_VIDEO_W, GUI_VIDEO_H)
            self.canvas.create_image(0, 0, anchor="nw", image=photo)
            self._photo = photo
            self.frame_lbl.config(text=f"Frame  {self._frame_count:>6}")
        except queue.Empty:
            pass
        self.after(16, self._poll_display)

    # ── TOKEN POLL ────────────────────────────────────────────────────────────

    def _poll_tokens(self):
        try:
            while True:
                msg_type, payload, latency = self.token_queue.get_nowait()

                if msg_type == "new_frame":
                    self._raw_buf = ""
                    self.stream_var.set("")
                    self.thinking_lbl.config(text="● thinking…")
                    self.status_lbl.config(text="● ANALYSING", fg=self.ACCENT)

                elif msg_type == "token":
                    self._raw_buf += payload
                    self.stream_var.set(self._raw_buf[-160:])
                    self._parse_and_update(self._raw_buf)

                elif msg_type == "done_stream":
                    self.thinking_lbl.config(text="")
                    # colour-code latency: green ≤2s, yellow ≤3s, orange >3s
                    col = (self.GOOD_LAT if latency <= 2.0 else
                           self.WARN_LAT if latency <= 3.0 else self.BAD_LAT)
                    self.lat_lbl.config(text=f"Latency  {latency:.2f}s", fg=col)
                    self.status_lbl.config(text="● LIVE", fg=self.NOW_COL)

                elif msg_type == "end":
                    self.status_lbl.config(text="● DONE", fg=self.TEXT_DIM)
                    self.thinking_lbl.config(text="")

        except queue.Empty:
            pass
        self.after(50, self._poll_tokens)

    def _parse_and_update(self, text: str):
        for key, box in [("PAST", self.past_box),
                         ("NOW",  self.now_box),
                         ("GOAL", self.goal_box)]:
            for line in text.splitlines():
                if line.startswith(f"{key}:"):
                    val = line[len(key)+1:].strip()
                    if val:
                        box.config(text=val)

    def on_close(self):
        self.video_reader.stop()
        self.destroy()

# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if not VIDEO_PATH.exists():
        print(f"[ERROR] Video not found: {VIDEO_PATH}")
        sys.exit(1)
    app = App()
    app.protocol("WM_DELETE_WINDOW", app.on_close)
    app.mainloop()