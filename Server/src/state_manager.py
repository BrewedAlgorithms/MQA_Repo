from __future__ import annotations

import threading
from typing import Any, Dict, List


class PipelineState:
    """Thread-safe singleton state for pipeline + API consumers."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.goal: str = ""
        self.current_step: str = ""
        self.step_completed: bool = False
        self.message: str = ""
        self.suggestion: str = ""
        self.sop_steps: List[str] = []
        self.checklist: List[Dict[str, Any]] = []

    def set_sop(self, sop_list: List[str]) -> None:
        with self._lock:
            self.sop_steps = list(sop_list)
            self.goal = self.sop_steps[-1] if self.sop_steps else ""
            # Reset checklist rows when SOP changes.
            self.checklist = [
                {"index": i, "name": name, "status": "pending"}
                for i, name in enumerate(self.sop_steps)
            ]

    def update_from_gpt(self, parsed: Dict[str, Any], state: Any) -> None:
        with self._lock:
            step = str(parsed.get("step", "")).strip()
            status = str(parsed.get("status", "")).strip().upper()
            reason = str(parsed.get("reason", "")).strip()
            action = str(parsed.get("action", "")).strip()

            self.current_step = step
            self.step_completed = status == "OK"
            self.message = reason or getattr(state, "alert", "") or ""
            self.suggestion = action

            if self.sop_steps:
                next_idx = min(getattr(state, "last_completed_index", -1) + 1, len(self.sop_steps) - 1)
                self.goal = self.sop_steps[next_idx] if next_idx >= 0 else self.sop_steps[0]

            completed = set(getattr(state, "completed_steps", []))
            skipped = set(getattr(state, "skipped_steps", []))
            expected = getattr(state, "last_completed_index", -1) + 1
            checklist: List[Dict[str, Any]] = []
            for i, name in enumerate(self.sop_steps):
                if i in completed:
                    row_status = "done"
                elif i in skipped:
                    row_status = "skipped"
                elif i == expected:
                    row_status = "current"
                else:
                    row_status = "pending"
                checklist.append({"index": i, "name": name, "status": row_status})
            self.checklist = checklist

        print("API STATE UPDATE:", self.get_state())

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "goal": self.goal,
                "current_step": self.current_step,
                "step_completed": self.step_completed,
                "message": self.message,
                "suggestion": self.suggestion,
                "sop_steps": list(self.sop_steps),
                "checklist": list(self.checklist),
            }


pipeline_state = PipelineState()
