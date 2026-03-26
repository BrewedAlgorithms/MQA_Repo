"""
sop_tracker.py  —  SOP Step Order Tracker
==========================================
Tracks which SOP steps have been completed, detects:
  - MISSING steps (step skipped entirely)
  - OUT_OF_ORDER steps (step done before its predecessor)
  - COMPLETED steps (correct order)

This is the core logic that was entirely missing from the project.
"""

from dataclasses import dataclass, field
from typing import List, Optional
import time


# ── DATA CLASSES ──────────────────────────────────────────────────────────────

@dataclass
class StepEvent:
    """One recorded step detection event."""
    step_index: int          # 0-based index into SOP list
    step_name: str
    status: str              # OK | MISSING | OUT_OF_ORDER | UNKNOWN
    reason: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class SOPState:
    """Current state of SOP progress."""
    total_steps: int
    last_completed_index: int = -1        # last step confirmed as done
    completed_steps: List[int] = field(default_factory=list)
    skipped_steps: List[int] = field(default_factory=list)
    alert: Optional[str] = None           # current alert message (None = no alert)
    alert_type: Optional[str] = None      # OK | WARNING | ERROR
    all_done: bool = False


# ── TRACKER ───────────────────────────────────────────────────────────────────

class SOPTracker:
    """
    Tracks SOP step completion and detects violations.

    Usage:
        tracker = SOPTracker(sop_steps)
        state   = tracker.update(gpt_step_str, gpt_status_str)
        # state.alert → message to show in GUI
        # state.alert_type → "OK" | "WARNING" | "ERROR"
    """

    def __init__(self, sop_steps: List[str]):
        self.steps = sop_steps
        self.n = len(sop_steps)
        self.state = SOPState(total_steps=self.n)
        self.history: List[StepEvent] = []
        self.context = {}

    # ── PUBLIC ────────────────────────────────────────────────────────────────

    def reset(self):
        """Reset tracker to initial state (use when restarting video/webcam)."""
        self.state = SOPState(total_steps=self.n)
        self.history.clear()
        self.context = {}

    def update_context(self, step_name):
        step_lower = str(step_name).lower()
        if "open laptop" in step_lower:
            self.context["laptop_open"] = True

        if "close laptop" in step_lower:
            self.context["laptop_open"] = False

    @property
    def last_completed_index(self) -> int:
        return self.state.last_completed_index

    def update(self, gpt_step: str, gpt_status: str, reason: str = "") -> SOPState:
        """
        Process one GPT response and update SOP state.

        Args:
            gpt_step:   The STEP field from GPT ("1", "2", ... or "none")
            gpt_status: The STATUS field from GPT ("OK", "MISSING",
                        "OUT_OF_ORDER", "UNKNOWN", "ERROR")
            reason:     The REASON field from GPT (for logging)

        Returns:
            Updated SOPState with alert message ready for the GUI.
        """
        # Clear previous alert
        self.state.alert = None
        self.state.alert_type = None

        # Parse step number
        step_idx = self._parse_step_index(gpt_step)

        if step_idx is None or gpt_status in ("UNKNOWN", "ERROR", "none"):
            # GPT couldn't identify a step — no state change, no alert
            self.state.alert = None
            self.state.alert_type = "OK"
            return self.state

        status_upper = gpt_status.upper()

        if status_upper == "OK":
            self._handle_ok(step_idx, reason)

        elif status_upper == "MISSING":
            self._handle_missing(step_idx, reason)

        elif status_upper == "OUT_OF_ORDER":
            self._handle_out_of_order(step_idx, reason)

        # Check if all steps are done
        if len(self.state.completed_steps) == self.n:
            self.state.all_done = True
            self.state.alert = "✔ All SOP steps completed!"
            self.state.alert_type = "OK"

        return self.state

    def get_checklist(self) -> List[dict]:
        """
        Return the full SOP as a checklist for the GUI.
        Each entry: {index, name, status}
        status: "done" | "skipped" | "pending" | "current"
        """
        checklist = []
        for i, step in enumerate(self.steps):
            if i in self.state.completed_steps:
                status = "done"
            elif i in self.state.skipped_steps:
                status = "skipped"
            elif i == self.state.last_completed_index + 1:
                status = "current"   # next expected step
            else:
                status = "pending"
            checklist.append({"index": i, "name": step, "status": status})
        return checklist

    def get_next_expected(self) -> Optional[str]:
        """Return the name of the next step that should be performed."""
        nxt = self.state.last_completed_index + 1
        if nxt < self.n:
            return self.steps[nxt]
        return None

    # ── PRIVATE ───────────────────────────────────────────────────────────────

    def _parse_step_index(self, gpt_step: str) -> Optional[int]:
        """Convert GPT step string ('1', '2', 'none') to 0-based index."""
        s = str(gpt_step).strip().lower()
        if s in ("none", "unknown", ""):
            return None
        # Extract first number found
        import re
        match = re.search(r'\d+', s)
        if not match:
            return None
        num = int(match.group())
        idx = num - 1   # convert to 0-based
        if 0 <= idx < self.n:
            return idx
        return None

    def _handle_ok(self, step_idx: int, reason: str):
        """Process a correctly performed step."""
        expected_next = self.state.last_completed_index + 1
        step_name = self.steps[step_idx]
        step_lower = step_name.lower()

        if "type on laptop" in step_lower and not self.context.get("laptop_open"):
            self.state.alert = "Laptop must be open first"
            self.state.alert_type = "ERROR"
            self._log(step_idx, "ERROR", "Laptop must be open first")
            return

        if step_idx in self.state.completed_steps:
            # Already done — ignore duplicate detection
            return

        if step_idx == expected_next:
            # Perfect — correct order
            self.state.completed_steps.append(step_idx)
            self.state.last_completed_index = step_idx
            self.state.alert = f"✔ Step {step_idx+1} done: {self.steps[step_idx]}"
            self.state.alert_type = "OK"
            self.update_context(self.steps[step_idx])
            self._log(step_idx, "OK", reason)

        elif step_idx > expected_next:
            # Steps were skipped to get here
            skipped = list(range(expected_next, step_idx))
            for s in skipped:
                if s not in self.state.skipped_steps:
                    self.state.skipped_steps.append(s)
            self.state.completed_steps.append(step_idx)
            self.state.last_completed_index = step_idx
            skipped_names = [f"Step {s+1}" for s in skipped]
            self.state.alert = (
                f"⚠ MISSING: {', '.join(skipped_names)} were skipped!\n"
                f"Now at Step {step_idx+1}: {self.steps[step_idx]}"
            )
            self.state.alert_type = "WARNING"
            self.update_context(self.steps[step_idx])
            for s in skipped:
                self._log(s, "MISSING", "Step was skipped")
            self._log(step_idx, "OK", reason)

        else:
            # Step done that was already passed — out of order
            self.state.alert = (
                f"⚠ OUT OF ORDER: Step {step_idx+1} already done!\n"
                f"Expected: Step {expected_next+1}: {self.steps[expected_next]}"
            )
            self.state.alert_type = "WARNING"
            self._log(step_idx, "OUT_OF_ORDER", "Already completed")

    def _handle_missing(self, step_idx: int, reason: str):
        """GPT explicitly detected a missing step."""
        if step_idx not in self.state.skipped_steps:
            self.state.skipped_steps.append(step_idx)
        self.state.alert = (
            f"❌ MISSING STEP: Step {step_idx+1}\n"
            f"{self.steps[step_idx]}\n"
            f"Reason: {reason}"
        )
        self.state.alert_type = "ERROR"
        self._log(step_idx, "MISSING", reason)

    def _handle_out_of_order(self, step_idx: int, reason: str):
        """GPT explicitly detected an out-of-order step."""
        expected_next = self.state.last_completed_index + 1
        self.state.alert = (
            f"❌ OUT OF ORDER: Step {step_idx+1} performed!\n"
            f"Expected: Step {expected_next+1}: {self.steps[expected_next]}\n"
            f"Reason: {reason}"
        )
        self.state.alert_type = "ERROR"
        self._log(step_idx, "OUT_OF_ORDER", reason)

    def _log(self, step_idx: int, status: str, reason: str):
        self.history.append(StepEvent(
            step_index=step_idx,
            step_name=self.steps[step_idx],
            status=status,
            reason=reason,
        ))