"""
webcam_streamer.py — Webcam capture + HLS output via FFmpeg → MediaMTX
=======================================================================
Opens the webcam directly, grabs frames in a background thread, and pipes
them into FFmpeg → RTSP → MediaMTX so the frontend can consume the stream
as HLS.

Usage (from main.py):
    streamer = WebcamHLSStreamer(cam_index=0, stream_name="cam")
    streamer.start()
    print(streamer.hls_url)
    ...
    frame = streamer.get_latest_frame()   # BGR numpy array or None
    ...
    streamer.stop()
"""

import os
import subprocess
import threading
import time

import cv2

MEDIAMTX_HOST = os.environ.get("MEDIAMTX_HOST", "localhost")
RTSP_PORT = int(os.environ.get("RTSP_PORT", 8554))
OUTPUT_FPS = 10


class WebcamHLSStreamer:
    """Opens the webcam, captures frames, and pipes them to FFmpeg for HLS."""

    def __init__(
        self,
        cam_index: int = 0,
        stream_name: str = "cam",
        mediamtx_host: str = MEDIAMTX_HOST,
        rtsp_port: int = RTSP_PORT,
        fps: int = OUTPUT_FPS,
    ):
        self.cam_index = cam_index
        self.stream_name = stream_name
        self.mediamtx_host = mediamtx_host
        self.rtsp_port = rtsp_port
        self.fps = fps

        self._cap: cv2.VideoCapture | None = None
        self._latest_frame = None
        self._frame_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._width = 0
        self._height = 0

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def hls_url(self) -> str:
        return f"http://{self.mediamtx_host}:8888/{self.stream_name}/index.m3u8"

    @property
    def rtsp_url(self) -> str:
        return f"rtsp://{self.mediamtx_host}:{self.rtsp_port}/{self.stream_name}"

    def start(self) -> None:
        """Open the webcam and start capture + FFmpeg threads."""
        self._cap = self._open_webcam(self.cam_index)
        if not self._cap or not self._cap.isOpened():
            raise RuntimeError(
                f"Could not open webcam index {self.cam_index}. "
                "Check System Settings → Privacy → Camera permissions."
            )

        self._width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        # Ensure even dimensions (required by libx264)
        self._width = self._width if self._width % 2 == 0 else self._width - 1
        self._height = self._height if self._height % 2 == 0 else self._height - 1

        # Start capture thread
        self._cap_thread = threading.Thread(
            target=self._capture_loop, daemon=True, name="webcam-capture"
        )
        self._cap_thread.start()

        # Wait for first frame
        deadline = time.time() + 5.0
        while time.time() < deadline:
            if self.get_latest_frame() is not None:
                break
            time.sleep(0.05)
        else:
            raise RuntimeError("No frame received from webcam within 5 seconds.")

        # Start FFmpeg pipe thread
        self._ffmpeg_thread = threading.Thread(
            target=self._ffmpeg_loop, daemon=True, name="ffmpeg-pipe"
        )
        self._ffmpeg_thread.start()

        print(f"\n[STREAMER] Webcam {self.cam_index} opened ({self._width}×{self._height})")
        print(f"[STREAMER] HLS  → {self.hls_url}")
        print(f"[STREAMER] RTSP → {self.rtsp_url}")

    def get_latest_frame(self):
        """Return the most recent BGR frame (thread-safe). May return None."""
        with self._frame_lock:
            return self._latest_frame

    def stop(self) -> None:
        """Stop capture and FFmpeg."""
        self._stop_event.set()
        if self._cap:
            self._cap.release()

    # ── Internals ─────────────────────────────────────────────────────────────

    @staticmethod
    def _open_webcam(index: int, timeout: float = 10.0) -> cv2.VideoCapture:
        print(f"[STREAMER] Opening webcam {index}…")
        deadline = time.time() + timeout
        cap = None
        while time.time() < deadline:
            cap = cv2.VideoCapture(index)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                return cap
            cap.release()
            time.sleep(1.0)
            print("[STREAMER] Retrying webcam…")
        return cap

    def _capture_loop(self) -> None:
        """Read frames from webcam as fast as possible, keep only the latest."""
        while not self._stop_event.is_set():
            ret, frame = self._cap.read()
            if not ret:
                time.sleep(0.01)
                continue
            with self._frame_lock:
                self._latest_frame = frame

    def _ffmpeg_loop(self) -> None:
        """Pipe frames to FFmpeg at a steady fps. Auto-reconnects on failure."""
        gop = self.fps
        cmd = [
            "ffmpeg",
            "-loglevel", "warning",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{self._width}x{self._height}",
            "-r", str(self.fps),
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
            self.rtsp_url,
        ]

        frame_interval = 1.0 / self.fps

        while not self._stop_event.is_set():
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            pipe_broken = False
            frame_count = 0
            start_time = time.time()

            try:
                while not self._stop_event.is_set():
                    frame = self.get_latest_frame()
                    if frame is None:
                        time.sleep(0.01)
                        continue

                    # Ensure correct dimensions
                    if frame.shape[1] != self._width or frame.shape[0] != self._height:
                        frame = cv2.resize(frame, (self._width, self._height))

                    if proc.poll() is not None:
                        print("[STREAMER] FFmpeg exited — reconnecting in 2s…")
                        pipe_broken = True
                        break

                    try:
                        proc.stdin.write(frame.tobytes())
                    except BrokenPipeError:
                        print("[STREAMER] FFmpeg pipe broken — reconnecting in 2s…")
                        pipe_broken = True
                        break

                    # Pace output at the target fps
                    frame_count += 1
                    next_time = start_time + frame_count * frame_interval
                    sleep_dur = next_time - time.time()
                    if sleep_dur > 0:
                        time.sleep(sleep_dur)

            except Exception as exc:
                print(f"[STREAMER] Error: {exc}")
                pipe_broken = True
            finally:
                try:
                    proc.stdin.close()
                except Exception:
                    pass
                proc.wait()

            if pipe_broken and not self._stop_event.is_set():
                time.sleep(2)
                print("[STREAMER] Restarting FFmpeg…")
                continue
            break
