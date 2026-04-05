"""
streamer.py – RTSP video streamer via FFmpeg + MediaMTX

Two modes:
  1. Video file  – FFmpeg reads & loops the file natively (no OpenCV pipe).
  2. Webcam      – OpenCV captures frames and pipes them into FFmpeg.

Each instance asks for a unique stream name at startup so multiple instances
can run in parallel, each on its own RTSP path:

  Instance A → rtsp://localhost:8554/camera1
  Instance B → rtsp://localhost:8554/camera2

  HLS:       http://localhost:8888/<name>/index.m3u8
  Timestamp: http://localhost:5051/position  → {"seconds": 42.5, "time": "0:42"}
"""

import cv2
import subprocess
import time
import os
import sys
import json
import threading
import msvcrt
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Config ─────────────────────────────────────────────────────────────────────
MEDIAMTX_HOST  = os.environ.get("MEDIAMTX_HOST", "localhost")
RTSP_PORT      = int(os.environ.get("RTSP_PORT", 8554))
TIMESTAMP_PORT = int(os.environ.get("TIMESTAMP_PORT", 5051))

_SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))
DEFAULT_VIDEO_PATH = os.path.join(_SCRIPT_DIR, "..", "..", "assets", "1.mp4")

# Shared state – written by the stream loop, read by the HTTP server
_position_lock    = threading.Lock()
_position_seconds = 0.0


# ── Timestamp HTTP server ──────────────────────────────────────────────────────
class TimestampHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
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


def _start_timestamp_server(max_tries: int = 20) -> int:
    for port in range(TIMESTAMP_PORT, TIMESTAMP_PORT + max_tries):
        try:
            server = _ReuseHTTPServer(("0.0.0.0", port), TimestampHandler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            print(f"[INFO] Timestamp API → http://localhost:{port}/position")
            return port
        except OSError:
            print(f"[WARN] Port {port} in use, trying {port + 1}…")
    raise RuntimeError(
        f"[ERROR] Could not bind timestamp server on ports "
        f"{TIMESTAMP_PORT}–{TIMESTAMP_PORT + max_tries - 1}"
    )


# ── Startup prompts ────────────────────────────────────────────────────────────
def get_stream_name() -> str:
    """Ask for a unique stream name (used as the RTSP/HLS path segment)."""
    print("\n=== MQA Video Streamer (RTSP) ===")
    print("Stream name (used as the RTSP path, e.g. 'camera1', 'line2', 'webcam').")
    print("Each running instance must use a different name.")
    while True:
        name = input("Stream name [live]: ").strip()
        if not name:
            name = "live"
        # Allow only URL-safe characters
        safe = name.replace(" ", "_")
        if safe != name:
            print(f"[INFO] Using '{safe}' (spaces replaced with underscores).")
            name = safe
        return name


def get_source_choice() -> tuple:
    print("\nWhat would you like to stream?")
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


# ── Per-path single-instance lock ─────────────────────────────────────────────
def _acquire_lock(stream_name: str) -> object:
    """
    Exclusively lock a per-path file so two instances cannot publish to the
    same RTSP path simultaneously.  Different names → different lock files →
    can run in parallel without conflict.
    """
    lock_path = os.path.join(_SCRIPT_DIR, f".streamer-{stream_name}.lock")
    fh = open(lock_path, "w")
    try:
        # Windows-specific non-blocking file lock
        msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        fh.close()
        print(f"[ERROR] A streamer is already publishing to path '{stream_name}'.")
        print(f"        Stop it first (Ctrl+C), or choose a different stream name.")
        sys.exit(1)
    fh.write(str(os.getpid()))
    fh.flush()
    return fh, lock_path


def _release_lock(fh, lock_path: str) -> None:
    try:
        # Windows-specific unlock
        fh.seek(0)
        msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        fh.close()
        os.unlink(lock_path)
    except Exception:
        pass


# ── Video file helpers ─────────────────────────────────────────────────────────
def get_video_duration(path: str) -> float:
    try:
        # Ensure we don't accidentally display a command window popup on Windows
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW
            
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True, text=True, timeout=10,
            creationflags=creationflags
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _track_file_position(duration: float, stop: threading.Event) -> None:
    global _position_seconds
    start = time.time()
    while not stop.is_set():
        elapsed = time.time() - start
        pos = (elapsed % duration) if duration > 0 else elapsed
        with _position_lock:
            _position_seconds = pos
        time.sleep(0.05)


# ── Video file streaming (FFmpeg-native, no OpenCV pipe) ───────────────────────
def stream_file(video_path: str, rtsp_url: str, stream_name: str,
                timestamp_port: int) -> None:
    duration = get_video_duration(video_path)
    gop = OUTPUT_FPS  # one keyframe per second

    cmd = [
        "ffmpeg",
        "-loglevel", "warning",
        "-stream_loop", "-1",
        "-re",
        "-i", video_path,
        # Enforce a strict, constant output frame rate — matches webcam mode.
        "-vf", f"fps={OUTPUT_FPS}",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-r", str(OUTPUT_FPS),
        "-g", str(gop),
        "-keyint_min", str(gop),
        "-sc_threshold", "0",
        "-an",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        rtsp_url,
    ]

    print(f"\n[INFO] Streaming video file '{video_path}' @ {OUTPUT_FPS} fps")
    print(f"[INFO] RTSP      → {rtsp_url}")
    print(f"[INFO] HLS       → http://{MEDIAMTX_HOST}:8888/{stream_name}/index.m3u8")
    print(f"[INFO] Timestamp → http://localhost:{timestamp_port}/position")
    print("[INFO] Press Ctrl+C to stop.\n")

    stop = threading.Event()
    threading.Thread(
        target=_track_file_position, args=(duration, stop), daemon=True
    ).start()

    while True:
        try:
            proc = subprocess.Popen(cmd)
            proc.wait()
        except FileNotFoundError:
            print("\n[ERROR] 'ffmpeg' is not recognized.")
            print("Please install FFmpeg for Windows and add it to your system PATH.")
            print("Download: https://github.com/BtbN/FFmpeg-Builds/releases")
            stop.set()
            return
        except KeyboardInterrupt:
            proc.terminate()
            proc.wait()
            stop.set()
            print("\n[INFO] Streamer stopped.")
            return

        stop.set()
        if proc.returncode == 0:
            return

        # Do NOT clear the old stop — let the old thread exit cleanly.
        print("[WARN] FFmpeg exited unexpectedly — reconnecting in 2s…")
        time.sleep(2)
        print("[INFO] Restarting FFmpeg…")
        stop = threading.Event()
        threading.Thread(
            target=_track_file_position, args=(duration, stop), daemon=True
        ).start()


# ── Webcam helper ──────────────────────────────────────────────────────────────
def open_webcam(index: int, timeout: float = 10.0) -> cv2.VideoCapture:
    print(f"[INFO] Opening webcam {index}…")
    print("[INFO] Windows: Make sure no other apps (e.g. Teams/Zoom) are using your webcam.")
    deadline = time.time() + timeout
    cap = None
    while time.time() < deadline:
        # cv2.CAP_DSHOW can sometimes load webcams faster on Windows
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not cap.isOpened():
             # Fallback to default if DirectShow fails
             cap = cv2.VideoCapture(index)
             
        if cap.isOpened():
            # Minimize internal frame buffer so we always read the freshest frame
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            return cap
        cap.release()
        time.sleep(1.0)
        print("[INFO] Retrying webcam…")
    return cap


# Shared output frame rate for both streaming modes.
# Both video-file and webcam output exactly this many frames per second so HLS
# segment lengths and GOP sizes stay consistent across all stations.
OUTPUT_FPS = 30

# Keep the old name as an alias so nothing else needs to change.
WEBCAM_OUTPUT_FPS = OUTPUT_FPS


def stream_webcam(capture: cv2.VideoCapture, rtsp_url: str, stream_name: str,
                  timestamp_port: int) -> None:

    width  = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))

    width  = width  if width  % 2 == 0 else width  - 1
    height = height if height % 2 == 0 else height - 1

    print(f"\n[INFO] Streaming webcam @ {WEBCAM_OUTPUT_FPS} fps")
    print(f"[INFO] RTSP      → {rtsp_url}")
    print(f"[INFO] HLS       → http://{MEDIAMTX_HOST}:8888/{stream_name}/index.m3u8")
    print(f"[INFO] Timestamp → http://localhost:{timestamp_port}/position")
    print("[INFO] Press Ctrl+C to stop.\n")

    # ── Background capture thread ────────────────────────────────────────────
    # Reads the webcam as fast as possible so the OS buffer never fills up.
    # Only the latest decoded frame is kept; older ones are discarded.
    _latest_frame: list = [None]   # list so the closure can rebind
    _cap_lock  = threading.Lock()
    _cap_stop  = threading.Event()

    def _capture_loop() -> None:
        while not _cap_stop.is_set():
            ret, frame = capture.read()
            if not ret:
                break
            with _cap_lock:
                _latest_frame[0] = frame

    cap_thread = threading.Thread(target=_capture_loop, daemon=True)
    cap_thread.start()

    # Wait until the first frame arrives
    deadline = time.time() + 5.0
    while time.time() < deadline:
        with _cap_lock:
            if _latest_frame[0] is not None:
                break
        time.sleep(0.05)
    else:
        print("[ERROR] No frame received from webcam within 5 s.")
        _cap_stop.set()
        capture.release()
        return

    # ── FFmpeg command ───────────────────────────────────────────────────────
    # GOP = WEBCAM_OUTPUT_FPS means one keyframe per second, keeping HLS
    # segments short without hammering the encoder with all-I-frame streams.
    gop = WEBCAM_OUTPUT_FPS

    cmd = [
        "ffmpeg",
        "-loglevel", "warning",
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}",
        "-r", str(WEBCAM_OUTPUT_FPS),
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-g", str(gop),
        "-keyint_min", str(gop),
        "-sc_threshold", "0",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        rtsp_url,
    ]

    frame_interval = 1.0 / WEBCAM_OUTPUT_FPS
    start_time     = time.time()
    frame_count    = 0

    while True:
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        except FileNotFoundError:
            print("\n[ERROR] 'ffmpeg' is not recognized.")
            print("Please install FFmpeg for Windows and add it to your system PATH.")
            print("Download: https://github.com/BtbN/FFmpeg-Builds/releases")
            _cap_stop.set()
            capture.release()
            return

        pipe_broken = False

        try:
            while True:
                # Grab the latest frame (already captured by background thread)
                with _cap_lock:
                    frame = _latest_frame[0]

                if frame is None:
                    time.sleep(0.01)
                    continue

                if frame.shape[1] != width or frame.shape[0] != height:
                    frame = cv2.resize(frame, (width, height))

                if proc.poll() is not None:
                    print("[WARN] FFmpeg exited unexpectedly — reconnecting in 2s…")
                    pipe_broken = True
                    break

                try:
                    proc.stdin.write(frame.tobytes())
                except BrokenPipeError:
                    print("[WARN] FFmpeg pipe closed — reconnecting in 2s…")
                    pipe_broken = True
                    break

                # Track elapsed time for the timestamp API
                with _position_lock:
                    _position_seconds = time.time() - start_time

                # Sleep precisely until the next frame slot
                frame_count += 1
                next_frame_time = start_time + frame_count * frame_interval
                sleep_dur = next_frame_time - time.time()
                if sleep_dur > 0:
                    time.sleep(sleep_dur)

        except KeyboardInterrupt:
            print("\n[INFO] Streamer stopped.")
            _cap_stop.set()
            try:
                proc.stdin.close()
            except Exception:
                pass
            proc.wait()
            capture.release()
            return
        finally:
            try:
                proc.stdin.close()
            except Exception:
                pass
            proc.wait()

        if pipe_broken:
            time.sleep(2)
            print("[INFO] Restarting FFmpeg…")
            continue

        _cap_stop.set()
        capture.release()
        return


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    stream_name = get_stream_name()
    rtsp_url    = f"rtsp://{MEDIAMTX_HOST}:{RTSP_PORT}/{stream_name}"

    fh, lock_path = _acquire_lock(stream_name)
    source_type, source = get_source_choice()
    bound_port = _start_timestamp_server()

    try:
        if source_type == "video":
            video_path = os.path.abspath(source)
            if not os.path.isfile(video_path):
                print(f"[ERROR] Video file not found: {video_path}")
                sys.exit(1)
            stream_file(video_path, rtsp_url, stream_name, timestamp_port=bound_port)

        else:
            capture = open_webcam(source)
            if not capture or not capture.isOpened():
                print(f"[ERROR] Could not open webcam index {source}")
                print("[HINT] Check Windows Settings → Privacy & Security → Camera")
                print("       and ensure apps have permission to access your camera.")
                sys.exit(1)
            stream_webcam(capture, rtsp_url, stream_name, timestamp_port=bound_port)
    finally:
        _release_lock(fh, lock_path)


if __name__ == "__main__":
    main()