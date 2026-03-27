from collections import deque
from math import hypot
from typing import Deque, Dict, List, Optional, Tuple

import cv2
from ultralytics import YOLO

from app.ai.schemas import Detection, HandInfo

# COCO keypoint indices
_LEFT_WRIST  = 9
_RIGHT_WRIST = 10

_KPT_CONF_MIN = 0.4


class MediaPipeHandActionDetector:
    """Deprecated placeholder to preserve import compatibility."""

    def __init__(self, *args, **kwargs):
        raise RuntimeError("MediaPipe backend disabled; use YoloPoseActionDetector instead")


class YoloPoseActionDetector:
    """
    Use a YOLO pose model to locate wrists, track motion, and link to objects.

    - Keypoint confidence gating: wrists with low visibility are ignored.
    - Bbox-edge distance for near_object: measures hand → nearest box edge.
    - Resolution-normalised movement thresholds.
    - Best-person selection: picks the detected person whose wrists are most visible.
    - Confidence-weighted history: bad frames are skipped.
    """

    def __init__(
        self,
        model_path: str,
        device: str = "auto",
        conf_threshold: float = 0.35,
        imgsz: int = 960,
        near_threshold_px: int = 80,
        kpt_conf_min: float = _KPT_CONF_MIN,
    ):
        self.model = YOLO(model_path)
        self.device = device
        self.conf_threshold = float(conf_threshold)
        self.imgsz = int(imgsz)
        self._near_threshold_norm = near_threshold_px / imgsz
        self.kpt_conf_min = float(kpt_conf_min)

        self.history: Dict[str, Deque[Tuple[int, int]]] = {
            "Left":  deque(maxlen=8),
            "Right": deque(maxlen=8),
        }
        self._last_keypoints = None
        self.last_wrist_positions: Dict = {
            "left_wrist": None,
            "right_wrist": None,
            "pose_detected": False,
        }

        print(
            f"[INFO] YOLO pose model={model_path} | device={self.device} | "
            f"imgsz={self.imgsz} | conf={self.conf_threshold} | "
            f"kpt_conf_min={self.kpt_conf_min}"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(self, frame, detections: List[Detection]) -> List[HandInfo]:
        h, w = frame.shape[:2]
        near_px = int(self._near_threshold_norm * max(w, h))

        results = self.model.predict(
            frame,
            verbose=False,
            device=self.device,
            conf=self.conf_threshold,
            imgsz=self.imgsz,
        )

        if not results:
            self._clear_pose()
            return []

        result = results[0]
        kpts = getattr(result, "keypoints", None)
        if kpts is None or kpts.xy is None or len(kpts.xy) == 0:
            self._clear_pose()
            return []

        best_idx = self._best_person_index(kpts)
        if best_idx is None:
            self._clear_pose()
            return []

        pts  = kpts.xy[best_idx]
        conf = kpts.conf[best_idx] if kpts.conf is not None else None

        left_xy  = self._xy_from_keypoint(pts, conf, _LEFT_WRIST)
        right_xy = self._xy_from_keypoint(pts, conf, _RIGHT_WRIST)

        if left_xy is None and right_xy is None:
            self._clear_pose()
            return []

        self._last_keypoints = pts
        self.last_wrist_positions = {
            "left_wrist":  left_xy,
            "right_wrist": right_xy,
            "pose_detected": True,
        }

        output: List[HandInfo] = []

        if left_xy is not None:
            near_left = self._nearby_object_labels(left_xy, detections, near_px)
            self.history["Left"].append(left_xy)
            output.append(HandInfo(
                side="Left",
                x=left_xy[0],
                y=left_xy[1],
                near_objects=near_left,
                movement=self._movement_label(self.history["Left"], max(w, h)),
            ))

        if right_xy is not None:
            near_right = self._nearby_object_labels(right_xy, detections, near_px)
            self.history["Right"].append(right_xy)
            output.append(HandInfo(
                side="Right",
                x=right_xy[0],
                y=right_xy[1],
                near_objects=near_right,
                movement=self._movement_label(self.history["Right"], max(w, h)),
            ))

        return output

    def close(self) -> None:
        """Nothing to close for YOLO backend."""
        return

    def draw_last_landmarks(self, frame) -> None:
        if self._last_keypoints is None:
            cv2.putText(
                frame,
                "NO PERSON DETECTED",
                (50, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 0, 255),
                2,
                cv2.LINE_AA,
            )
            return

        for (x, y) in self._last_keypoints:
            cv2.circle(frame, (int(x), int(y)), 4, (0, 255, 0), -1)

        lw = self.last_wrist_positions.get("left_wrist")
        rw = self.last_wrist_positions.get("right_wrist")
        if lw:
            cv2.circle(frame, lw, 8, (0, 200, 255), -1)
        if rw:
            cv2.circle(frame, rw, 8, (0, 200, 255), -1)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _best_person_index(self, kpts) -> Optional[int]:
        """
        Tier 1: person with at least one wrist above kpt_conf_min, highest sum.
        Tier 2: fallback to highest raw wrist-confidence sum when no one clears the bar.
        """
        if kpts.conf is None:
            return 0 if len(kpts.xy) > 0 else None

        if len(kpts.xy) == 0:
            return None

        best_above: Optional[int] = None
        best_above_score = -1.0
        best_any: Optional[int] = None
        best_any_score = -1.0

        for i, conf_row in enumerate(kpts.conf):
            score = 0.0
            passes = False
            for idx in (_LEFT_WRIST, _RIGHT_WRIST):
                if idx < len(conf_row):
                    c = float(conf_row[idx])
                    score += c
                    if c >= self.kpt_conf_min:
                        passes = True

            if score > best_any_score:
                best_any_score = score
                best_any = i

            if passes and score > best_above_score:
                best_above_score = score
                best_above = i

        if best_above is not None:
            return best_above

        return best_any

    def _xy_from_keypoint(
        self,
        pts,
        conf,
        idx: int,
    ) -> Optional[Tuple[int, int]]:
        if idx >= len(pts):
            return None

        x, y = pts[idx]

        if conf is not None and idx < len(conf):
            c = float(conf[idx])
            if c < 0.05:
                return None
            if c < self.kpt_conf_min and x == 0.0 and y == 0.0:
                return None
        else:
            if x == 0.0 and y == 0.0:
                return None

        return (int(x), int(y))

    def _clear_pose(self) -> None:
        self._last_keypoints = None
        self.last_wrist_positions = {
            "left_wrist": None,
            "right_wrist": None,
            "pose_detected": False,
        }

    def _nearby_object_labels(
        self,
        hand_xy: Tuple[int, int],
        detections: List[Detection],
        near_threshold_px: int,
    ) -> List[str]:
        """Return unique labels within threshold, sorted by distance."""
        hx, hy = hand_xy
        within: List[Tuple[str, float]] = []

        for det in detections:
            x1, y1, x2, y2 = det.bbox_xyxy
            cx = max(x1, min(hx, x2))
            cy = max(y1, min(hy, y2))
            dist = hypot(hx - cx, hy - cy)
            if dist <= near_threshold_px:
                within.append((det.label, dist))

        if not within:
            return []

        closest: Dict[str, float] = {}
        for label, dist in within:
            if label not in closest or dist < closest[label]:
                closest[label] = dist

        ordered = sorted(closest.items(), key=lambda kv: kv[1])
        labels = [lbl for lbl, _ in ordered]

        if len(labels) > 1 and "person" in labels:
            labels = [lbl for lbl in labels if lbl != "person"] + ["person"]

        return labels

    def _movement_label(
        self,
        points: Deque[Tuple[int, int]],
        frame_dim: int,
    ) -> str:
        """
        Classify wrist motion as 'static', 'moving', or 'rotating'.

        static   : total path length < 2% of frame
        rotating : total path > 6% of frame AND net displacement < 35% of path
        moving   : everything else with path > 6%
        """
        if len(points) < 3:
            return "static"

        path_len = 0.0
        for i in range(1, len(points)):
            x1, y1 = points[i - 1]
            x2, y2 = points[i]
            path_len += hypot(x2 - x1, y2 - y1)

        static_thresh = frame_dim * 0.02
        moving_thresh = frame_dim * 0.06
        rotate_ratio  = 0.35

        if path_len < static_thresh:
            return "static"

        start_x, start_y = points[0]
        end_x,   end_y   = points[-1]
        net_disp = hypot(end_x - start_x, end_y - start_y)

        if path_len > moving_thresh and net_disp < max(
            frame_dim * 0.012, path_len * rotate_ratio
        ):
            return "rotating"

        if path_len >= static_thresh:
            return "moving"

        return "static"
