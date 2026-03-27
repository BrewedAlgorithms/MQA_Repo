from collections import deque
from math import hypot
from typing import Deque, Dict, List, Optional, Tuple

import cv2
from ultralytics import YOLO

from schemas import Detection, HandInfo

# COCO keypoint indices
_LEFT_WRIST  = 9
_RIGHT_WRIST = 10

# Minimum keypoint visibility score to trust a detection.
# YOLO returns a confidence per keypoint in kpts.conf; below this we treat
# the wrist as invisible (e.g., occluded, out of frame).
_KPT_CONF_MIN = 0.4


class MediaPipeHandActionDetector:
    """Deprecated placeholder to preserve import compatibility."""

    def __init__(self, *args, **kwargs):
        raise RuntimeError("MediaPipe backend disabled; use YoloPoseActionDetector instead")


class YoloPoseActionDetector:
    """
    Use a YOLO pose model to locate wrists, track motion, and link to objects.

    Accuracy improvements over the original:
    - Keypoint confidence gating: wrists with low visibility are ignored rather
      than emitting a (0, 0) or jitter point.
    - Bbox-edge distance for near_object: measures hand → nearest box edge
      instead of hand → box center, so large objects register a touch earlier.
    - Resolution-normalised movement thresholds: thresholds scale with imgsz so
      the same physical gesture produces the same label regardless of resolution.
    - Best-person selection: picks the detected person whose wrists are most
      visible instead of blindly taking index 0.
    - Confidence-weighted history: bad frames are skipped rather than poisoning
      the motion deque.
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
        # Scale near_threshold relative to imgsz so it stays valid when the
        # caller changes imgsz between runs.
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

        # --- pick the best person (most visible wrist keypoints) ----------
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
        Return the index of the person whose wrist keypoints have the highest
        combined confidence, using a two-tier strategy:

        Tier 1 (preferred): a person who has at least one wrist above
                kpt_conf_min.  Among all such people, pick the one with the
                highest wrist-confidence sum.
        Tier 2 (fallback):  no one clears the threshold — e.g. only hands are
                visible in a close-up shot and the pose model assigns low
                scores to every keypoint.  In this case return the person with
                the highest raw wrist-confidence sum anyway, because a low-
                confidence wrist that is geometrically non-zero is still more
                useful than silently dropping the frame.

        Returns None only when there are no detections at all.
        """
        if kpts.conf is None:
            return 0 if len(kpts.xy) > 0 else None

        if len(kpts.xy) == 0:
            return None

        best_above: Optional[int] = None   # best index that clears the bar
        best_above_score = -1.0
        best_any: Optional[int] = None     # best index regardless of threshold
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

        # Tier 1: someone clears the threshold — use them
        if best_above is not None:
            return best_above

        # Tier 2: no one clears the threshold (hands-only / close-up frame)
        # Use whoever has the highest wrist score, as long as the coords are
        # non-zero (the (0,0) guard in _xy_from_keypoint handles truly missing
        # keypoints downstream).
        return best_any

    def _xy_from_keypoint(
        self,
        pts,
        conf,
        idx: int,
    ) -> Optional[Tuple[int, int]]:
        """
        Return (x, y) for a keypoint, with two levels of rejection:

        - Hard reject: confidence is available AND is effectively zero
          (< 0.05).  This catches truly absent keypoints that YOLO marks with
          a near-zero score even in close-up / hands-only frames.
        - Soft reject (normal operation): confidence is below kpt_conf_min
          (~0.4) AND the coords are (0, 0).  In a hands-only frame the model
          may return a low-but-non-zero confidence with valid pixel coords —
          we keep that rather than discarding a usable detection.
        """
        if idx >= len(pts):
            return None

        x, y = pts[idx]

        if conf is not None and idx < len(conf):
            c = float(conf[idx])
            # Hard reject: essentially invisible keypoint
            if c < 0.05:
                return None
            # Soft reject: below normal threshold only if coords are also zero
            if c < self.kpt_conf_min and x == 0.0 and y == 0.0:
                return None
        else:
            # No conf available — only reject the (0, 0) sentinel
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
        """Return unique labels within threshold, sorted by distance; move
        'person' to the end if a more specific object is also nearby."""
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

        # Keep the closest instance of each label.
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

        Thresholds are expressed as fractions of the frame's longer dimension
        so that the same physical gesture produces the same label at any
        resolution.

        static   : total path length < 2 % of frame
        rotating : total path > 6 % of frame AND net displacement < 35 % of path
        moving   : everything else with path > 6 %
        """
        if len(points) < 3:
            return "static"

        path_len = 0.0
        for i in range(1, len(points)):
            x1, y1 = points[i - 1]
            x2, y2 = points[i]
            path_len += hypot(x2 - x1, y2 - y1)

        static_thresh   = frame_dim * 0.02   # ~19 px at 960
        moving_thresh   = frame_dim * 0.06   # ~58 px at 960
        rotate_ratio    = 0.35

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