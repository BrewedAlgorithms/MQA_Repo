from collections import deque
from math import hypot
from typing import Deque, Dict, List, Optional, Tuple
import time
import warnings

import cv2
import mediapipe as mp

from schemas import Detection, HandInfo


class MediaPipeHandActionDetector:
    """Detect hands, estimate movement type, and assign nearby objects."""

    def __init__(self, near_threshold_px: int = 80):
        self.near_threshold_px = near_threshold_px

        self._legacy_solutions_available = hasattr(mp, "solutions")
        self._hand_detection_enabled = self._legacy_solutions_available

        if self._legacy_solutions_available:
            self.mp_pose = mp.solutions.pose
            self.mp_draw = mp.solutions.drawing_utils
            self.pose = self.mp_pose.Pose(
                static_image_mode=False,
                model_complexity=0,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        else:
            self.mp_pose = None
            self.mp_draw = None
            self.pose = None
            warnings.warn(
                "MediaPipe Pose unavailable in this environment (mp.solutions missing). "
                "Install Python 3.11/3.12 with mediapipe 0.10.x legacy solutions support to enable hand tracking.",
                RuntimeWarning,
            )
        self._last_pose_landmarks = None
        self.last_wrist_positions = {
            "left_wrist": None,
            "right_wrist": None,
            "pose_detected": False,
        }
        self._last_pose_print_time = 0.0
        self._last_pose_state: Optional[bool] = None

        # Keep short motion history for each hand side.
        self.history: Dict[str, Deque[Tuple[int, int]]] = {
            "Left": deque(maxlen=8),
            "Right": deque(maxlen=8),
        }

    def analyze(self, frame, detections: List[Detection]) -> List[HandInfo]:
        """Analyze hand positions, proximity, and motion class."""
        now = time.time()

        if not self._hand_detection_enabled:
            self._last_pose_landmarks = None
            self.last_wrist_positions = {
                "left_wrist": None,
                "right_wrist": None,
                "pose_detected": False,
            }
            if self._last_pose_state is not False or now - self._last_pose_print_time >= 2.5:
                print("Pose detected:", False)
                self._last_pose_print_time = now
                self._last_pose_state = False
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
            return []

        h, w = frame.shape[:2]
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.pose.process(frame_rgb)

        self._last_pose_landmarks = results.pose_landmarks

        if not results.pose_landmarks:
            self.last_wrist_positions = {
                "left_wrist": None,
                "right_wrist": None,
                "pose_detected": False,
            }
            if self._last_pose_state is not False or now - self._last_pose_print_time >= 2.5:
                print("Pose detected:", False)
                self._last_pose_print_time = now
                self._last_pose_state = False
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
            return []

        landmarks = results.pose_landmarks.landmark
        left_wrist_raw = landmarks[self.mp_pose.PoseLandmark.LEFT_WRIST]
        right_wrist_raw = landmarks[self.mp_pose.PoseLandmark.RIGHT_WRIST]

        left_xy_raw = (int(left_wrist_raw.x * w), int(left_wrist_raw.y * h))
        right_xy_raw = (int(right_wrist_raw.x * w), int(right_wrist_raw.y * h))

        # Frame is horizontally flipped, so swap label mapping once and use swapped coords everywhere.
        left_xy = right_xy_raw
        right_xy = left_xy_raw

        self.last_wrist_positions = {
            "left_wrist": left_xy,
            "right_wrist": right_xy,
            "pose_detected": True,
        }
        if self._last_pose_state is not True or now - self._last_pose_print_time >= 2.5:
            print("Pose detected:", True)
            print("Visible LEFT wrist:", left_xy)
            print("Visible RIGHT wrist:", right_xy)
            self._last_pose_print_time = now
            self._last_pose_state = True

        cv2.circle(frame, left_xy, 10, (0, 255, 0), -1)
        cv2.circle(frame, right_xy, 10, (0, 255, 0), -1)

        output: List[HandInfo] = []

        near_left = self._nearest_object_label(left_xy, detections)
        near_right = self._nearest_object_label(right_xy, detections)

        self.history["Left"].append(left_xy)
        self.history["Right"].append(right_xy)

        output.append(
            HandInfo(
                side="Left",
                x=left_xy[0],
                y=left_xy[1],
                near_object=near_left,
                movement=self._movement_label(self.history["Left"]),
            )
        )
        output.append(
            HandInfo(
                side="Right",
                x=right_xy[0],
                y=right_xy[1],
                near_object=near_right,
                movement=self._movement_label(self.history["Right"]),
            )
        )

        return output

    def close(self) -> None:
        """Release MediaPipe resources."""
        if self.pose is not None:
            self.pose.close()

    def draw_last_landmarks(self, frame) -> None:
        """Draw hand landmarks from the most recent analyze call."""
        if not self._hand_detection_enabled:
            return

        if not self._last_pose_landmarks:
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

        self.mp_draw.draw_landmarks(
            frame,
            self._last_pose_landmarks,
            self.mp_pose.POSE_CONNECTIONS,
        )

        left_xy = self.last_wrist_positions.get("left_wrist")
        right_xy = self.last_wrist_positions.get("right_wrist")
        if left_xy is not None:
            cv2.circle(frame, left_xy, 10, (0, 255, 0), -1)
        if right_xy is not None:
            cv2.circle(frame, right_xy, 10, (0, 255, 0), -1)

    def _nearest_object_label(
        self, hand_xy: Tuple[int, int], detections: List[Detection]
    ) -> Optional[str]:
        """Return nearest object label if within threshold, else None."""
        hx, hy = hand_xy
        nearest_label: Optional[str] = None
        nearest_dist = float("inf")

        for det in detections:
            x1, y1, x2, y2 = det.bbox_xyxy
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            dist = hypot(hx - cx, hy - cy)
            if dist < nearest_dist:
                nearest_dist = dist
                nearest_label = det.label

        if nearest_label is not None and nearest_dist <= self.near_threshold_px:
            return nearest_label
        return None

    def _movement_label(self, points: Deque[Tuple[int, int]]) -> str:
        """
        Heuristic movement classifier:
        - static: very small motion
        - moving: directional movement
        - rotating: path is long but net displacement small (loop-like motion)
        """
        if len(points) < 3:
            return "static"

        path_len = 0.0
        for i in range(1, len(points)):
            x1, y1 = points[i - 1]
            x2, y2 = points[i]
            path_len += hypot(x2 - x1, y2 - y1)

        start_x, start_y = points[0]
        end_x, end_y = points[-1]
        net_disp = hypot(end_x - start_x, end_y - start_y)

        if path_len < 20:
            return "static"

        # If hand travels a lot but returns close to start, likely circular/rotational.
        if path_len > 60 and net_disp < max(12, path_len * 0.35):
            return "rotating"

        return "moving"
