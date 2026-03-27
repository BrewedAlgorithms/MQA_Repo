"""
streamer.py – RTSP video streamer via FFmpeg + MediaMTX
Asks at startup whether to stream a video file or the webcam,
then pipes frames into FFmpeg which pushes RTSP to MediaMTX.

  RTSP:      rtsp://localhost:8554/live
  HLS:       http://localhost:8888/live/index.m3u8
  Timestamp: http://localhost:5051/position  → {"seconds": 42.5, "time": "0:42"}
"""

import cv2
import subprocess
import time
import os
import sys
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Config ─────────────────────────────────────────────────────────────────────
MEDIAMTX_HOST  = os.environ.get("MEDIAMTX_HOST", "localhost")
RTSP_PORT      = int(os.environ.get("RTSP_PORT", 8554))
STREAM_PATH    = os.environ.get("STREAM_PATH", "live")
RTSP_URL       = f"rtsp://{MEDIAMTX_HOST}:{RTSP_PORT}/{STREAM_PATH}"
TIMESTAMP_PORT = int(os.environ.get("TIMESTAMP_PORT", 5051))

_SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))
DEFAULT_VIDEO_PATH = os.path.join(_SCRIPT_DIR, "..", "assets", "1.mp4")

# Shared state – written by the stream loop, read by the HTTP server
_position_lock    = threading.Lock()
_position_seconds = 0.0   # current playback position in seconds


# ── Timestamp HTTP server ──────────────────────────────────────────────────────
class TimestampHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # suppress request noise
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/position":
            with _position_lock:
                secs = _position_seconds
            mins = int(secs) // 60
            s    = int(secs) % 60
            payload = json.dumps({
                "seconds": round(secs, 2),
                "time": f"{mins}:{s:02d}",
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(payload)
        else:
            self.send_response(404)
            self._cors()
            self.end_headers()


class _ReuseHTTPServer(HTTPServer):
    allow_reuse_address = True


def _start_timestamp_server():
    server = _ReuseHTTPServer(("0.0.0.0", TIMESTAMP_PORT), TimestampHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[INFO] Timestamp API → http://localhost:{TIMESTAMP_PORT}/position")


# ── Source selection ───────────────────────────────────────────────────────────
def get_source_choice():
    print("\n=== MQA Video Streamer (RTSP) ===")
    print("What would you like to stream?")
    print(f"  1. Video file  ({os.path.normpath(DEFAULT_VIDEO_PATH)})")
    print("  2. Webcam")
    while True:
        choice = input("Enter 1 or 2: ").strip()
        if choice == "1":
            return "video", DEFAULT_VIDEO_PATH
        elif choice == "2":
            cam_index = input("Enter webcam index (default 0): ").strip()
            cam_index = int(cam_index) if cam_index.isdigit() else 0
            return "webcam", cam_index
        else:
            print("Invalid choice. Please enter 1 or 2.")


# ── Webcam helper ──────────────────────────────────────────────────────────────
def open_webcam(index: int, timeout: float = 6.0) -> cv2.VideoCapture:
    print(f"[INFO] Opening webcam {index}…")
    print("[INFO] macOS: if a permission dialog appears, click OK then wait a moment.")
    deadline = time.time() + timeout
    cap = None
    while time.time() < deadline:
        cap = cv2.VideoCapture(index)
        if cap.isOpened():
            return cap
        cap.release()
        time.sleep(1.0)
        print("[INFO] Retrying webcam…")
    return cap


# ── FFmpeg subprocess builder ──────────────────────────────────────────────────
def build_ffmpeg_cmd(width: int, height: int, fps: float) -> list[str]:
    return [
        "ffmpeg",
        "-loglevel", "warning",
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}",
        "-r", str(fps),
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        RTSP_URL,
    ]


# ── Main streaming loop ────────────────────────────────────────────────────────
def stream(capture: cv2.VideoCapture, source_label: str):
    global _position_seconds

    width  = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = capture.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

    # Ensure even dimensions (H.264 requirement)
    width  = width  if width  % 2 == 0 else width  - 1
    height = height if height % 2 == 0 else height - 1

    cmd = build_ffmpeg_cmd(width, height, fps)

    print(f"\n[INFO] Streaming {source_label}")
    print(f"[INFO] RTSP  → {RTSP_URL}")
    print(f"[INFO] HLS   → http://{MEDIAMTX_HOST}:8888/{STREAM_PATH}/index.m3u8")
    print("[INFO] Press Ctrl+C to stop.\n")

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    is_video_file  = capture.get(cv2.CAP_PROP_FRAME_COUNT) > 0
    frame_interval = 1.0 / fps
    next_frame_time = time.time()

    try:
        while True:
            ret, frame = capture.read()
            if not ret:
                if is_video_file:
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    next_frame_time = time.time()
                    with _position_lock:
                        _position_seconds = 0.0
                    continue
                else:
                    print("[WARN] Webcam read failed — stopping.")
                    break

            # Update shared video position (seconds into the file)
            pos_ms = capture.get(cv2.CAP_PROP_POS_MSEC)
            with _position_lock:
                _position_seconds = pos_ms / 1000.0

            # Resize if needed
            if frame.shape[1] != width or frame.shape[0] != height:
                frame = cv2.resize(frame, (width, height))

            try:
                proc.stdin.write(frame.tobytes())
            except BrokenPipeError:
                print("[ERROR] FFmpeg pipe closed unexpectedly.")
                break

            # Pace to real-time
            next_frame_time += frame_interval
            sleep_dur = next_frame_time - time.time()
            if sleep_dur > 0:
                time.sleep(sleep_dur)
            else:
                next_frame_time = time.time()

    except KeyboardInterrupt:
        print("\n[INFO] Streamer stopped.")
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        proc.wait()
        capture.release()


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    source_type, source = get_source_choice()

    if source_type == "webcam":
        capture = open_webcam(source)
    else:
        capture = cv2.VideoCapture(source)

    if not capture or not capture.isOpened():
        print(f"[ERROR] Could not open source: {source}")
        if source_type == "webcam":
            print("[HINT] Go to System Settings → Privacy & Security → Camera")
            print("       and grant camera access to Terminal (or your Python app).")
        sys.exit(1)

    label = (
        f"video file '{source}'"
        if source_type == "video"
        else f"webcam (index {source})"
    )

    _start_timestamp_server()
    stream(capture, label)


if __name__ == "__main__":
    main()
