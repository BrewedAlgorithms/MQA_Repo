"""
streamer.py – RTSP video streamer via FFmpeg + MediaMTX
Asks at startup whether to stream a video file or the webcam,
then pipes frames into FFmpeg which pushes RTSP to MediaMTX.

  RTSP:  rtsp://localhost:8554/live
  HLS:   http://localhost:8888/live/index.m3u8
"""

import cv2
import subprocess
import time
import os
import sys

# ── Config ─────────────────────────────────────────────────────────────────────
MEDIAMTX_HOST  = os.environ.get("MEDIAMTX_HOST", "localhost")
RTSP_PORT      = int(os.environ.get("RTSP_PORT", 8554))
STREAM_PATH    = os.environ.get("STREAM_PATH", "live")
RTSP_URL       = f"rtsp://{MEDIAMTX_HOST}:{RTSP_PORT}/{STREAM_PATH}"

_SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))
DEFAULT_VIDEO_PATH = os.path.join(_SCRIPT_DIR, "..", "assets", "1.mp4")


# ── Source selection ───────────────────────────────────────────────────────────
def get_source_choice():
    """Prompt the user to choose between streaming a video file or the webcam."""
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
    """
    Try opening the webcam for up to `timeout` seconds.
    On macOS, the first open() triggers a permission dialog.
    """
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
    return cap  # may be un-opened; caller checks


# ── FFmpeg subprocess builder ──────────────────────────────────────────────────
def build_ffmpeg_cmd(width: int, height: int, fps: float) -> list[str]:
    """
    Returns an FFmpeg command that reads raw BGR24 frames from stdin
    and pushes them as an H.264 RTSP stream to MediaMTX.
    """
    return [
        "ffmpeg",
        "-loglevel", "warning",
        # Input: raw video from stdin
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}",
        "-r", str(fps),
        "-i", "pipe:0",
        # Output: H.264 → RTSP
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

    is_video_file = capture.get(cv2.CAP_PROP_FRAME_COUNT) > 0
    frame_interval = 1.0 / fps   # seconds per frame at native FPS
    next_frame_time = time.time()

    try:
        while True:
            ret, frame = capture.read()
            if not ret:
                if is_video_file:
                    # Loop the video
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    next_frame_time = time.time()
                    continue
                else:
                    print("[WARN] Webcam read failed — stopping.")
                    break

            # Resize if dimensions mismatch (safety guard)
            if frame.shape[1] != width or frame.shape[0] != height:
                frame = cv2.resize(frame, (width, height))

            try:
                proc.stdin.write(frame.tobytes())
            except BrokenPipeError:
                print("[ERROR] FFmpeg pipe closed unexpectedly.")
                break

            # Pace to real-time: sleep until the next frame's wall-clock deadline
            next_frame_time += frame_interval
            sleep_dur = next_frame_time - time.time()
            if sleep_dur > 0:
                time.sleep(sleep_dur)
            else:
                # We're behind — reset deadline to avoid a spiral
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

    stream(capture, label)


if __name__ == "__main__":
    main()
