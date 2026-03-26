from typing import Iterable, List

import cv2

from ultralytics import YOLO

from schemas import Detection


class YoloObjectDetector:
    """YOLOv8 wrapper for object detection."""

    def __init__(self, model_path: str, target_labels: Iterable[str]):
        self.model = YOLO(model_path)
        self.target_labels = {name.lower() for name in target_labels}

    def detect(self, frame) -> List[Detection]:
        """Run YOLO on a frame and return all detected classes."""
        results = self.model(frame, verbose=False)
        if not results:
            return []

        output: List[Detection] = []
        detected_classes: List[str] = []
        result = results[0]

        # YOLO returns class IDs that map to names in result.names.
        names = result.names if hasattr(result, "names") else {}

        if result.boxes is None:
            return output

        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            label = str(names.get(cls_id, f"cls_{cls_id}")).lower()

            confidence = float(box.conf[0].item())
            detected_classes.append(f"{label}({confidence:.2f})")
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            output.append(
                Detection(
                    label=label,
                    confidence=confidence,
                    bbox_xyxy=(x1, y1, x2, y2),
                )
            )

        print("Raw YOLO detections:", detected_classes)

        return output


def format_detections(detections: List[Detection]) -> str:
    """Format detections like: bolt(0.95), washer(0.88)."""
    if not detections:
        return "none"
    return ", ".join(f"{d.label}({d.confidence:.2f})" for d in detections)


def draw_detections(frame, detections: List[Detection]) -> None:
    """Draw YOLO boxes and labels directly on the frame."""
    for det in detections:
        x1, y1, x2, y2 = det.bbox_xyxy
        cv2.rectangle(frame, (x1, y1), (x2, y2), (80, 220, 80), 2)
        label = f"{det.label} {det.confidence:.2f}"
        cv2.putText(
            frame,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (80, 220, 80),
            2,
            cv2.LINE_AA,
        )
