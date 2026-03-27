"""
dev.py — Dev-only manual controls for the worker HUD.

All state is in-memory; resets on backend restart.

Step control
------------
Set step 3:   GET /dev/Camera A/step/3
Read step:    GET /dev/Camera A/step

Safety error toast
------------------
Send a message to the worker screen (shows as a 1-second toast):
    GET /dev/Camera A/safetyerr/Helmet not worn
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/dev", tags=["dev"])


def _key(station_name: str) -> str:
    return station_name.strip().lower()


# ── Step state ─────────────────────────────────────────────────────────────────

_active_steps: dict[str, int] = {}


@router.get("/{station_name}/step", summary="Get active step")
def get_step(station_name: str):
    return {"step": _active_steps.get(_key(station_name), 1), "station": station_name}


@router.get("/{station_name}/step/{num}", summary="Set active step")
def set_step(station_name: str, num: int):
    if num < 1:
        raise HTTPException(status_code=400, detail="Step number must be >= 1")
    _active_steps[_key(station_name)] = num
    return {"step": num, "station": station_name}


# ── Safety error toast ─────────────────────────────────────────────────────────

# {station_key: {"message": str, "ts": str}}
_safety_errors: dict[str, dict] = {}


@router.get(
    "/{station_name}/safetyerr/{message}",
    summary="Send a safety error toast to the worker screen",
    description="Stores the message with a timestamp. The worker HUD polls this and shows a 1-second toast.",
)
def send_safety_error(station_name: str, message: str):
    entry = {
        "message": message,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    _safety_errors[_key(station_name)] = entry
    return {"station": station_name, **entry}


@router.get("/{station_name}/safetyerr", summary="Get latest safety error for a station")
def get_safety_error(station_name: str):
    return _safety_errors.get(_key(station_name)) or {"message": None, "ts": None}
