from dataclasses import dataclass, field
from typing import List, Optional, Tuple



@dataclass
class Detection:
    label: str
    confidence: float
    bbox_xyxy: Tuple[int, int, int, int]  # x1, y1, x2, y2


@dataclass
class HandInfo:
    side: str                          # "Left" or "Right"
    x: int
    y: int
    near_objects: List[str]            # all objects within threshold, closest first
    movement: str                      # "static" | "moving" | "rotating"

    # ------------------------------------------------------------------
    # Backward-compatibility shim: code that reads hand.near_object
    # (singular) still works — it gets the first item or None.
    # ------------------------------------------------------------------
    @property
    def near_object(self) -> Optional[str]:
        return self.near_objects[0] if self.near_objects else None




@dataclass
class FrameAnalysis:
    """Combined structured result for one sampled frame."""

    frame_index: int
    timestamp_sec: float
    detections: List[Detection] = field(default_factory=list)
    hands: List[HandInfo] = field(default_factory=list)
    fusion_text: str = ""
