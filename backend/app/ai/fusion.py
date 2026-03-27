from typing import List, Optional

from app.ai.schemas import Detection, HandInfo


def format_actions(hands: List[HandInfo]) -> str:
    """
    Format hand actions for display.

    Example outputs:
        right_hand near bottle, person, moving
        left_hand not near any known object, static
    """
    if not hands:
        return "none"

    parts = []
    for hand in hands:
        side = hand.side.lower()
        objects = getattr(hand, "near_objects", None)

        if objects is None:
            legacy = getattr(hand, "near_object", None)
            objects = [legacy] if legacy else []

        if objects:
            near = "near " + ", ".join(objects)
        else:
            near = "not near any known object"

        parts.append(f"{side}_hand {near}, {hand.movement}")

    return "; ".join(parts)


def build_fusion_text(
    detections: List[Detection],
    hands: List[HandInfo],
    raw_detections: Optional[List[Detection]] = None,
) -> str:
    """
    Combine object detections and hand analysis into one sentence.

    Parameters
    ----------
    detections : List[Detection]
        Filtered detections (after confidence threshold).
    hands : List[HandInfo]
        Hand info produced by YoloPoseActionDetector.analyze().
    raw_detections : Optional[List[Detection]]
        All YOLO detections before confidence filtering (shown in a separate line).
    """
    if detections:
        det_text = ", ".join(
            f"{d.label}({d.confidence:.2f})" for d in detections
        )
    else:
        det_text = "none"

    raw_line = ""
    if raw_detections:
        raw_text = ", ".join(
            f"{d.label}({d.confidence:.2f})" for d in raw_detections
        )
        raw_line = f" Raw detections: {raw_text}."

    if not hands:
        hand_text = "No hands detected."
    else:
        chunks = []
        for hand in hands:
            objects = getattr(hand, "near_objects", None)
            if objects is None:
                legacy = getattr(hand, "near_object", None)
                objects = [legacy] if legacy else []

            if objects:
                near = "near " + ", ".join(objects)
            else:
                near = "not near any known object"

            chunks.append(
                f"{hand.side} hand at ({hand.x}, {hand.y}), {near}, {hand.movement}"
            )
        hand_text = "; ".join(chunks) + "."

    return f"Objects: {det_text}.{raw_line} {hand_text}"
