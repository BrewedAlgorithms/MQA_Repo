"""
sop_tracker.py  —  SOP Step Order Tracker (STRICT MODE)
=========================================================
Tracks which SOP steps have been completed, detects:
  - MISSING steps (step skipped — BLOCKS progression)
  - OUT_OF_ORDER steps (step done before its predecessor — BLOCKS progression)
  - COMPLETED steps (correct order only)

STRICT ENFORCEMENT:
  - If the operator skips a step or jumps ahead, an immediate alert fires.
  - last_completed_index does NOT advance until the CORRECT next step is done.
  - The operator MUST complete the missing step before the system will accept
    any further step as valid.
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
    status: str              # OK | MISSING | OUT_OF_ORDER | UNKNOWN | BLOCKED
    reason: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class SOPState:
    """Current state of SOP progress."""
    total_steps: int
    last_completed_index: int = -1        # last step confirmed as done (STRICT: never skips)
    completed_steps: List[int] = field(default_factory=list)
    skipped_steps: List[int] = field(default_factory=list)
    alert: Optional[str] = None           # current alert message (None = no alert)
    alert_type: Optional[str] = None      # OK | WARNING | ERROR
    all_done: bool = False
    blocked: bool = False                 # True when waiting for a missed step to be redone
    blocked_on_step: Optional[int] = None # 0-based index of the step we're waiting for
    completion_time: Optional[float] = None  # epoch time when all_done was first set


# ── TRACKER ───────────────────────────────────────────────────────────────────

class SOPTracker:
    """
    Tracks SOP step completion and STRICTLY enforces sequential order.

    Usage:
        tracker = SOPTracker(sop_steps)
        state   = tracker.update(gpt_step_str, gpt_status_str, reason)
        # state.alert      → message to show in GUI
        # state.alert_type → "OK" | "WARNING" | "ERROR"
        # state.blocked    → True = operator must redo the missed step NOW
    """

    def __init__(self, sop_steps: List[str]):
        self.steps = sop_steps
        self.n = len(sop_steps)
        self.state = SOPState(total_steps=self.n)
        self.history: List[StepEvent] = []

    # ── PUBLIC ────────────────────────────────────────────────────────────────

    def reset(self):
        """Reset tracker to initial state (use when restarting video/webcam)."""
        self.state = SOPState(total_steps=self.n)
        self.history.clear()

    @property
    def last_completed_index(self) -> int:
        return self.state.last_completed_index

    def update(self, gpt_step: str, gpt_status: str, reason: str = "") -> SOPState:
        """
        Process one GPT response and update SOP state.

        STRICT RULES:
          1. If the system is blocked (waiting for a missed step), ONLY the
             blocked step can unblock it. Any other detection keeps the
             block alert active.
          2. If GPT reports a step that is NOT the next expected one,
             fire an immediate alert and do NOT advance the index.
          3. Steps can only be completed in exact sequence: 1 → 2 → 3 → …

        Args:
            gpt_step:   The STEP field from GPT ("1", "2", ... or "none")
            gpt_status: The STATUS field from GPT
            reason:     The REASON field from GPT (for logging)

        Returns:
            Updated SOPState with alert ready for the GUI.
        """
        # Clear previous transient alert (persistent block alerts are kept below)
        self.state.alert = None
        self.state.alert_type = None

        # Parse step number
        step_idx = self._parse_step_index(gpt_step)

        # GPT couldn't identify a step — keep current state, no change
        if step_idx is None or gpt_status in ("UNKNOWN", "ERROR", "none"):
            if self.state.blocked:
                # Re-show the block alert so the GUI stays aware
                self._reissue_block_alert()
            else:
                self.state.alert_type = "OK"
            return self.state

        status_upper = gpt_status.upper()

        # ── BLOCKED MODE: only accept the exact missed step ────────────────
        if self.state.blocked:
            required = self.state.blocked_on_step
            if step_idx == required and status_upper == "OK":
                # Operator finally performed the missed step — unblock
                self.state.blocked = False
                self.state.blocked_on_step = None
                self._complete_step(step_idx, reason)
            else:
                # Still hasn't done the missed step — keep blocking
                self._reissue_block_alert()
            return self.state

        # ── NORMAL MODE ────────────────────────────────────────────────────
        if status_upper == "OK":
            self._handle_ok(step_idx, reason)
        elif status_upper == "MISSING":
            self._handle_missing(step_idx, reason)
        elif status_upper == "OUT_OF_ORDER":
            self._handle_out_of_order(step_idx, reason)

        # Check if all steps are done
        if len(self.state.completed_steps) == self.n:
            self.state.all_done = True
            if self.state.completion_time is None:
                self.state.completion_time = time.time()
            self.state.alert = "✔ All SOP steps completed!"
            self.state.alert_type = "OK"

        return self.state

    def get_checklist(self) -> List[dict]:
        """
        Return the full SOP as a checklist for the GUI.
        Each entry: {index, name, status}
        status: "done" | "skipped" | "pending" | "current" | "blocked"
        """
        checklist = []
        for i, step in enumerate(self.steps):
            if i in self.state.completed_steps:
                status = "done"
            elif i == self.state.blocked_on_step:
                status = "blocked"   # must be performed NOW
            elif i == self.state.last_completed_index + 1:
                status = "current"   # next expected step
            else:
                status = "pending"
            checklist.append({"index": i, "name": step, "status": status})
        return checklist

    def get_next_expected(self) -> Optional[str]:
        """Return the name of the next step that should be performed."""
        if self.state.blocked and self.state.blocked_on_step is not None:
            return self.steps[self.state.blocked_on_step]
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
        import re
        match = re.search(r'\d+', s)
        if not match:
            return None
        num = int(match.group())
        idx = num - 1   # convert to 0-based
        if 0 <= idx < self.n:
            return idx
        return None

    def _complete_step(self, step_idx: int, reason: str):
        """Mark step as completed and advance the index."""
        self.state.completed_steps.append(step_idx)
        self.state.last_completed_index = step_idx
        self.state.alert = (
            f"✔ Step {step_idx + 1} done: {self.steps[step_idx]}"
        )
        self.state.alert_type = "OK"
        self._log(step_idx, "OK", reason)

    def _block_on_step(self, missing_idx: int, detected_idx: int):
        """
        Enter blocked mode: require missing_idx to be completed before
        any further progress is allowed.
        """
        self.state.blocked = True
        self.state.blocked_on_step = missing_idx
        self.state.alert = (
            f"❌ MISSED STEP {missing_idx + 1}: \"{self.steps[missing_idx]}\"\n"
            f"You jumped to Step {detected_idx + 1}. "
            f"Go back and complete Step {missing_idx + 1} first!\n"
            f"⛔ No further steps will be accepted until Step {missing_idx + 1} is done."
        )
        self.state.alert_type = "ERROR"
        self._log(missing_idx, "MISSING", f"Operator skipped to Step {detected_idx + 1}")

    def _reissue_block_alert(self):
        """Re-emit the block alert while waiting for the operator to fix it."""
        req = self.state.blocked_on_step
        self.state.alert = (
            f"⛔ BLOCKED — Complete Step {req + 1} first: "
            f"\"{self.steps[req]}\"\n"
            f"No other step will be accepted until this is done."
        )
        self.state.alert_type = "ERROR"

    def _handle_ok(self, step_idx: int, reason: str):
        """
        STRICT: only accept step_idx if it is exactly the next expected step.
        If it is ahead → block immediately.
        If it is behind (already done) → ignore.
        """
        expected_next = self.state.last_completed_index + 1

        if step_idx in self.state.completed_steps:
            # Already done — ignore duplicate detection silently
            self.state.alert_type = "OK"
            return

        if step_idx == expected_next:
            # ✔ Correct next step
            self._complete_step(step_idx, reason)

        elif step_idx > expected_next:
            # ⛔ Operator skipped one or more steps — block immediately
            # Always block on the FIRST missing step (expected_next)
            self._block_on_step(expected_next, step_idx)

        else:
            # Step is behind expected_next and not in completed list
            # (shouldn't normally happen, but handle gracefully)
            self.state.alert = (
                f"⚠ Step {step_idx + 1} detected, but already past this point.\n"
                f"Expected: Step {expected_next + 1}: {self.steps[expected_next]}"
            )
            self.state.alert_type = "WARNING"
            self._log(step_idx, "OUT_OF_ORDER", "Detected step already passed")

    def _handle_missing(self, step_idx: int, reason: str):
        """
        GPT explicitly flagged a missing step — enter blocked mode immediately.
        """
        expected_next = self.state.last_completed_index + 1
        block_target = min(step_idx, expected_next)  # always block on the earliest missing
        self.state.blocked = True
        self.state.blocked_on_step = block_target
        self.state.alert = (
            f"❌ MISSING STEP {block_target + 1}: \"{self.steps[block_target]}\"\n"
            f"Reason: {reason}\n"
            f"⛔ Complete Step {block_target + 1} before proceeding."
        )
        self.state.alert_type = "ERROR"
        self._log(block_target, "MISSING", reason)

    def _handle_out_of_order(self, step_idx: int, reason: str):
        """
        GPT explicitly flagged an out-of-order step — block on the expected step.
        """
        expected_next = self.state.last_completed_index + 1
        self.state.blocked = True
        self.state.blocked_on_step = expected_next
        self.state.alert = (
            f"❌ OUT OF ORDER: Step {step_idx + 1} performed!\n"
            f"Expected: Step {expected_next + 1}: \"{self.steps[expected_next]}\"\n"
            f"Reason: {reason}\n"
            f"⛔ Go back and complete Step {expected_next + 1} first."
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