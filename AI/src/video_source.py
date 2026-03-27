from typing import Generator, Tuple, Union

import cv2

_LIVE_PREFIXES = ("http://", "https://", "rtsp://", "rtsps://")


def is_live_stream(source) -> bool:
    """Return True for network stream URLs (HLS, RTSP, etc.)."""
    return str(source).startswith(_LIVE_PREFIXES)


def parse_video_source(source: str) -> Union[int, str]:
    """Treat numeric input as webcam index, otherwise as file/URL path."""
    source = str(source).strip()
    if source.isdigit():
        return int(source)
    return source


def sampled_frames(
    source: Union[int, str], sample_interval_sec: float
) -> Generator[Tuple[int, float, any], None, None]:
    """
    Yield frames sampled by time interval.

    Returns tuples of:
    - frame index
    - timestamp in seconds
    - frame (BGR image)
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Unable to open video source: {source}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps is None or fps <= 0:
        fps = 30.0

    sample_every_n_frames = max(int(round(sample_interval_sec * fps)), 1)

    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % sample_every_n_frames == 0:
            timestamp = frame_idx / fps
            yield frame_idx, timestamp, frame

        frame_idx += 1

    cap.release()
