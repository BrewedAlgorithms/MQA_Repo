"""
gpt_vision.py  —  GPT-4o Vision inspector for Manufacturing QA
==============================================================
Sends a video frame + SOP context to GPT-4o and returns a
structured response with STEP / STATUS / REASON / ACTION fields.

FIX: was using client.responses.create (doesn't exist) →
     now uses client.chat.completions.create (correct SDK call)
"""

import base64
from typing import List

import cv2
from openai import OpenAI

# ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are a manufacturing QA inspector monitoring a production line.

You will be given:
- Ordered SOP steps
- Last completed step
- Current frame observation

IMPORTANT RULES:

1. Steps must follow logical dependencies
    Example:
    - "type on laptop" requires laptop to be open
    - "pour water" requires bottle in hand

2. Even if a step visually appears correct:
    - If prerequisite is not satisfied -> mark as MISSING or OUT_OF_ORDER

3. Use reasoning, not just matching

Respond in EXACTLY this format (no extra text):
STEP: <step number 1-N or "none">
STATUS: <OK | MISSING | OUT_OF_ORDER | UNKNOWN>
REASON: <one short sentence>
ACTION: <one short instruction for the operator>
""".strip()


# ── HELPERS ───────────────────────────────────────────────────────────────────

def frame_to_b64(frame_bgr, quality: int = 40) -> str:
    """Encode OpenCV BGR frame to base64 JPEG string."""
    ok, buf = cv2.imencode(".jpg", frame_bgr,
                           [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Failed to encode frame as JPG")
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def build_user_prompt(
    sop_steps: List[str],
    last_completed_index: int,
    fusion_text: str,
    frame_time_sec: float,
) -> str:
    """Build the user message that goes alongside the image."""
    sop_formatted = "\n".join(
        f"  Step {i+1}: {s}" for i, s in enumerate(sop_steps)
    )
    last_done = (
        f"Step {last_completed_index + 1}: {sop_steps[last_completed_index]}"
        if 0 <= last_completed_index < len(sop_steps)
        else "None yet"
    )
    next_expected = (
        f"Step {last_completed_index + 2}: {sop_steps[last_completed_index + 1]}"
        if last_completed_index + 1 < len(sop_steps)
        else "All steps complete"
    )

    return (
        f"Frame time: {frame_time_sec:.1f}s\n\n"
        f"SOP Steps (in order):\n{sop_formatted}\n\n"
        f"Last completed: {last_done}\n"
        f"Next expected : {next_expected}\n\n"
        f"Current frame observation:\n{fusion_text}"
    )


# ── INSPECTOR CLASS ────────────────────────────────────────────────────────────

class GptVisionInspector:
    """Calls GPT-4o Vision for SOP compliance checking."""

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def inspect_frame(
        self,
        frame_bgr,
        sop_steps: List[str],
        fusion_text: str,
        frame_time_sec: float,
        last_completed_index: int = -1,
        jpeg_quality: int = 40,
    ) -> str:
        """
        Send frame + context to GPT-4o.
        Returns structured string: STEP / STATUS / REASON / ACTION
        """
        b64 = frame_to_b64(frame_bgr, quality=jpeg_quality)
        user_prompt = build_user_prompt(
            sop_steps, last_completed_index, fusion_text, frame_time_sec
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{b64}",
                                    "detail": "low",   # 85-token fixed cost
                                },
                            },
                        ],
                    },
                ],
                max_tokens=100,
                temperature=0,
            )
        except Exception as exc:
            return (
                "STEP: Unknown\n"
                "STATUS: ERROR\n"
                f"REASON: API call failed — {exc}\n"
                "ACTION: Check API key and network connection"
            )

        text = response.choices[0].message.content.strip()
        if not text:
            return (
                "STEP: Unknown\nSTATUS: ERROR\n"
                "REASON: Empty model response\nACTION: Retry"
            )

        # Validate the 4 required fields are present
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        required = ["STEP:", "STATUS:", "REASON:", "ACTION:"]
        if all(any(l.startswith(r) for l in lines) for r in required):
            return "\n".join(lines)

        # Fallback if format is broken
        return (
            "STEP: Unknown\n"
            "STATUS: ERROR\n"
            f"REASON: Bad format — {lines[0] if lines else 'empty'}\n"
            "ACTION: Follow SOP order"
        )

    def parse_response(self, response_text: str) -> dict:
        """
        Parse the structured response string into a dict.
        Keys: step, status, reason, action
        """
        result = {"step": "Unknown", "status": "UNKNOWN",
                  "reason": "", "action": ""}
        for line in response_text.splitlines():
            line = line.strip()
            if line.startswith("STEP:"):
                result["step"] = line[5:].strip()
            elif line.startswith("STATUS:"):
                result["status"] = line[7:].strip().upper()
            elif line.startswith("REASON:"):
                result["reason"] = line[7:].strip()
            elif line.startswith("ACTION:"):
                result["action"] = line[7:].strip()
        return result