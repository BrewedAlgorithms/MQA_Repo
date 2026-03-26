from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class Detection:
    """Represents one YOLO detection."""

    label: str
    confidence: float
    bbox_xyxy: Tuple[int, int, int, int]


@dataclass
class HandInfo:
    """Represents one detected hand and its interpreted behavior."""

    side: str
    x: int
    y: int
    near_object: Optional[str] = None
    movement: str = "static"


@dataclass
class FrameAnalysis:
    """Combined structured result for one sampled frame."""

    frame_index: int
    timestamp_sec: float
    detections: List[Detection] = field(default_factory=list)
    hands: List[HandInfo] = field(default_factory=list)
    fusion_text: str = ""
