from typing import List

from schemas import Detection, HandInfo


def format_actions(hands: List[HandInfo]) -> str:
    """Format actions like: right_hand near bolt, moving."""
    if not hands:
        return "none"

    parts = []
    for hand in hands:
        side = hand.side.lower()
        near = f"near {hand.near_object}" if hand.near_object else "not near any known object"
        parts.append(f"{side}_hand {near}, {hand.movement}")
    return "; ".join(parts)


def build_fusion_text(detections: List[Detection], hands: List[HandInfo]) -> str:
    """Combine object detections and human action analysis into one sentence."""
    if detections:
        det_text = ", ".join(f"{d.label}({d.confidence:.2f})" for d in detections)
    else:
        det_text = "none"

    if not hands:
        hand_text = "No hands detected."
    else:
        chunks = []
        for hand in hands:
            near = f"near {hand.near_object}" if hand.near_object else "not near any known object"
            motion = hand.movement
            chunks.append(f"{hand.side} hand at ({hand.x}, {hand.y}), {near}, {motion}")
        hand_text = "; ".join(chunks) + "."

    return f"Objects: {det_text}. {hand_text}"
