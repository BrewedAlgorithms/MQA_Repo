"""
gpt_vision.py  —  GPT-4o Vision inspector for Manufacturing QA
==============================================================
Sends a video frame + SOP context to GPT-4o and returns a
structured response with:

  Core fields (step logic):
    STEP / STATUS / REASON / ACTION

  Safety fields (parallel check, never affects step logic):
    SAFETY_OK  : true | false
    SAFETY_MSG : one-line message to show the worker if safety not followed
"""

import base64
import json
from typing import List, Optional

import cv2
from openai import OpenAI

# ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are a manufacturing QA inspector monitoring a production line.

You will be given:
- The ordered SOP (Standard Operating Procedure) steps
- The last completed step index (0-based, -1 if none done yet)
- What is currently visible in the frame (detected objects + hand actions)
- The safety requirements that MUST be visually followed for the current step

Your job:
1. Identify which SOP step (if any) is currently being performed
2. Check if it is the CORRECT NEXT step
3. Flag if a step was SKIPPED or done OUT OF ORDER
4. SEPARATELY check if the worker is following all safety requirements for the current step

Important interpretation rules:
- Use BOTH the image and text observation. The image has higher priority if they conflict.
- For Step 1 "Open laptop": if the laptop is clearly already open (screen visible and usable),
  treat Step 1 as completed with STATUS: OK even if the opening motion is not visible.
- Do not require hand movement for every step; visible completed state can be enough.
- If visibility is ambiguous, return STATUS: UNKNOWN instead of forcing MISSING.

Safety check rules:
- SAFETY_OK must be "true" or "false" (lowercase).
- Check ONLY the safety requirements listed for the CURRENT step being performed.
- If no safety requirements are given, always set SAFETY_OK: true and SAFETY_MSG: (empty).
- SAFETY_MSG must be a single short sentence telling the worker what to fix right now.
  Example: "Put on your helmet before proceeding."
- Safety result is INDEPENDENT — even if SAFETY_OK is false, still report the step STATUS normally.

If you are ever unsure or information is missing, still respond using the required fields
with STATUS: UNKNOWN and SAFETY_OK: true. Do NOT refuse the task.

Return ONLY a JSON object with these keys:
- step (string, "1"-"N" or "none")
- status (string: OK | MISSING | OUT_OF_ORDER | UNKNOWN)
- reason (string, one short sentence)
- action (string, one short instruction)
- safety_ok (boolean)
- safety_msg (string, one short sentence or empty)
""".strip()

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "qa_inspection",
        "schema": {
            "type": "object",
            "properties": {
                "step":       {"type": "string"},
                "status":     {"type": "string"},
                "reason":     {"type": "string"},
                "action":     {"type": "string"},
                "safety_ok":  {"type": "boolean"},
                "safety_msg": {"type": "string"},
            },
            "required": ["step", "status", "reason", "action", "safety_ok", "safety_msg"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}


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
    current_step_safety: Optional[List[str]] = None,
) -> str:
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

    if current_step_safety:
        safety_lines = "\n".join(f"  - {req}" for req in current_step_safety)
        safety_section = f"Safety requirements for current step:\n{safety_lines}"
    else:
        safety_section = "Safety requirements for current step: None"

    return (
        f"Frame time: {frame_time_sec:.1f}s\n\n"
        f"SOP Steps (in order):\n{sop_formatted}\n\n"
        f"Last completed: {last_done}\n"
        f"Next expected : {next_expected}\n\n"
        f"{safety_section}\n\n"
        f"Current frame observation:\n{fusion_text}"
    )


# ── INSPECTOR CLASS ────────────────────────────────────────────────────────────

class GptVisionInspector:
    """Calls GPT-4o Vision for SOP compliance + safety checking."""

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
        jpeg_quality: int = 70,
        current_step_safety: Optional[List[str]] = None,
    ) -> str:
        b64 = frame_to_b64(frame_bgr, quality=jpeg_quality)
        user_prompt = build_user_prompt(
            sop_steps,
            last_completed_index,
            fusion_text,
            frame_time_sec,
            current_step_safety=current_step_safety,
        )

        print(f"\n[GPT_VISION] OpenAI user prompt:\n{user_prompt}\n")

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
                                    "detail": "auto",
                                },
                            },
                        ],
                    },
                ],
                response_format=RESPONSE_FORMAT,
                max_tokens=200,
                temperature=0,
            )
        except Exception as exc:
            return (
                "STEP: Unknown\n"
                "STATUS: ERROR\n"
                f"REASON: API call failed — {exc}\n"
                "ACTION: Check API key and network connection\n"
                "SAFETY_OK: true\n"
                "SAFETY_MSG: "
            )

        text = response.choices[0].message.content.strip()
        if text:
            print("[GPT_VISION] OpenAI response:\n" + text + "\n")
        if not text:
            return (
                "STEP: Unknown\nSTATUS: ERROR\n"
                "REASON: Empty model response\nACTION: Retry\n"
                "SAFETY_OK: true\nSAFETY_MSG: "
            )

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            formatted = self._format_dict_response(parsed)
            if formatted:
                return formatted

        lines = [l.strip() for l in text.splitlines() if l.strip()]

        refusal_markers = ["i'm sorry", "cannot assist", "can't assist"]
        if any(m in text.lower() for m in refusal_markers):
            return (
                "STEP: Unknown\n"
                "STATUS: ERROR\n"
                "REASON: Model refused to answer\n"
                "ACTION: Retry or simplify prompt\n"
                "SAFETY_OK: true\n"
                "SAFETY_MSG: "
            )

        required = ["STEP:", "STATUS:", "REASON:", "ACTION:", "SAFETY_OK:", "SAFETY_MSG:"]
        if all(any(l.startswith(r) for l in lines) for r in required):
            return "\n".join(lines)

        core_required = ["STEP:", "STATUS:", "REASON:", "ACTION:"]
        if all(any(l.startswith(r) for l in lines) for r in core_required):
            return "\n".join(lines) + "\nSAFETY_OK: true\nSAFETY_MSG: "

        return (
            "STEP: Unknown\n"
            "STATUS: ERROR\n"
            f"REASON: Bad format — {lines[0] if lines else 'empty'}\n"
            "ACTION: Follow SOP order\n"
            "SAFETY_OK: true\n"
            "SAFETY_MSG: "
        )

    def parse_response(self, response_text: str) -> dict:
        # If the response is already a JSON string (due to response_format={"type": "json_schema"}),
        # we should parse it as JSON directly.
        try:
            data = json.loads(response_text)
            return {
                "step": str(data.get("step", "Unknown")),
                "status": str(data.get("status", "UNKNOWN")).upper(),
                "reason": str(data.get("reason", "")),
                "action": str(data.get("action", "")),
                "safety_ok": bool(data.get("safety_ok", True)),
                "safety_msg": str(data.get("safety_msg", "")),
            }
        except json.JSONDecodeError:
            pass

        # Fallback for legacy plain text format
        result = {
            "step": "Unknown",
            "status": "UNKNOWN",
            "reason": "",
            "action": "",
            "safety_ok": True,
            "safety_msg": "",
        }
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
            elif line.startswith("SAFETY_OK:"):
                val = line[10:].strip().lower()
                result["safety_ok"] = (val == "true")
            elif line.startswith("SAFETY_MSG:"):
                result["safety_msg"] = line[11:].strip()
        return result

    @staticmethod
    def _format_dict_response(payload: dict) -> Optional[str]:
        """Convert a JSON dict from the model into the legacy 6-line string."""
        if not isinstance(payload, dict):
            return None

        step      = str(payload.get("step", "Unknown")).strip() or "Unknown"
        status    = str(payload.get("status", "UNKNOWN")).strip().upper() or "UNKNOWN"
        reason    = str(payload.get("reason", "")).strip()
        action    = str(payload.get("action", "")).strip()

        safety_ok_val = payload.get("safety_ok", True)
        if isinstance(safety_ok_val, str):
            safety_ok = safety_ok_val.strip().lower() == "true"
        else:
            safety_ok = bool(safety_ok_val)

        safety_msg = str(payload.get("safety_msg", "")).strip()

        if not status or not action:
            return None

        return (
            f"STEP: {step}\n"
            f"STATUS: {status}\n"
            f"REASON: {reason}\n"
            f"ACTION: {action}\n"
            f"SAFETY_OK: {'true' if safety_ok else 'false'}\n"
            f"SAFETY_MSG: {safety_msg}"
        )
