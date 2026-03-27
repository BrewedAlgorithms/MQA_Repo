import io
import os
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from bson import ObjectId
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import List
from openai import AsyncOpenAI
from dotenv import load_dotenv
from docx import Document

from app.database import get_db
from app.models import (
    SopProcessRequest,
    SopOut,
    SopStep,
    SopStepCreate,
    SopStepUpdate,
)

load_dotenv()

router = APIRouter(prefix="/api", tags=["sop"])

_openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ── OpenAI structured-output schema ───────────────────────────────────────────

class _ExtractedStep(BaseModel):
    title: str = Field(description="Short action title, e.g. 'Check Seal Integrity'")
    description: str = Field(description="Detailed description of what needs to be done in this step")
    requires: List[str] = Field(default=[], description="Exact 'title' strings of prerequisite steps")


class _ExtractedSOP(BaseModel):
    steps: List[_ExtractedStep]


async def _extract_steps(sop_text: str) -> List[_ExtractedStep]:
    prompt = f"""You are an expert at parsing Standard Operating Procedure (SOP) documents.
Read the SOP text below and extract every step as a structured list.

For each step provide:
- title: a short, clear action name (e.g. "Visual inspection", "Torque calibration")
- description: a concise but complete description of exactly what must be done
- requires: array of exact 'title' strings of steps that must be completed before this one (empty if none)

SOP Text:
---
{sop_text}
---"""

    completion = await _openai.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that outputs structured SOP steps as JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format=_ExtractedSOP,
    )
    parsed = completion.choices[0].message.parsed
    return parsed.steps


def _sop_out(doc: dict) -> SopOut:
    return SopOut(
        id=str(doc["_id"]),
        station_id=doc["station_id"],
        filename=doc.get("filename"),
        steps=doc.get("steps", []),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


# ── Upload + process a .docx file ─────────────────────────────────────────────

@router.post(
    "/sop/upload",
    response_model=SopOut,
    status_code=201,
    summary="Upload and process a .docx SOP file",
    description=(
        "Accepts a `.docx` file upload via `multipart/form-data`. "
        "Extracts plain text from the document server-side, then runs the same "
        "GPT-4o-mini extraction pipeline as `/sop/process`. "
        "The resulting SOP is persisted to MongoDB and returned."
    ),
    response_description="The newly created SOP document with all extracted steps.",
    responses={
        400: {"description": "Malformed `station_id` or unsupported file type."},
        404: {"description": "Station not found."},
        422: {"description": "Document contains no extractable text."},
        502: {"description": "OpenAI extraction call failed."},
    },
)
async def upload_sop(
    station_id: str = Form(..., description="MongoDB ObjectId of the target station."),
    file: UploadFile = File(..., description=".docx file to process."),
):
    db = get_db()

    try:
        s_oid = ObjectId(station_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid station_id")
    station = await db.stations.find_one({"_id": s_oid})
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    raw = await file.read()
    try:
        doc = Document(io.BytesIO(raw))
        sop_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse .docx file: {e}")

    if not sop_text.strip():
        raise HTTPException(status_code=422, detail="Document contains no extractable text")

    try:
        extracted = await _extract_steps(sop_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI extraction failed: {e}")

    steps = [
        SopStep(
            step_id=str(uuid.uuid4()),
            order=idx + 1,
            title=s.title,
            description=s.description,
            requires=s.requires,
        )
        for idx, s in enumerate(extracted)
    ]

    now = datetime.now(timezone.utc)
    doc_record = {
        "station_id": station_id,
        "filename": file.filename,
        "steps": [s.model_dump() for s in steps],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.sops.insert_one(doc_record)
    doc_record["_id"] = result.inserted_id
    return _sop_out(doc_record)


# ── Process a new SOP document ────────────────────────────────────────────────

@router.post(
    "/sop/process",
    response_model=SopOut,
    status_code=201,
    summary="Process a SOP document",
    description=(
        "Sends the raw SOP text to **GPT-4o-mini** which extracts every action as a structured step "
        "(title, description, prerequisite dependencies). "
        "The result is persisted to MongoDB and returned immediately.\n\n"
        "The `filename` field is optional — supply it to retain the original file name for audit purposes."
    ),
    response_description="The newly created SOP document with all extracted steps.",
    responses={
        400: {"description": "Malformed `station_id`."},
        404: {"description": "Station not found."},
        422: {"description": "`sop_text` is empty."},
        502: {"description": "OpenAI extraction call failed."},
    },
)
async def process_sop(body: SopProcessRequest):
    db = get_db()

    # validate station exists
    try:
        s_oid = ObjectId(body.station_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid station_id")
    station = await db.stations.find_one({"_id": s_oid})
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    if not body.sop_text.strip():
        raise HTTPException(status_code=422, detail="sop_text must not be empty")

    try:
        extracted = await _extract_steps(body.sop_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI extraction failed: {e}")

    steps = [
        SopStep(
            step_id=str(uuid.uuid4()),
            order=idx + 1,
            title=s.title,
            description=s.description,
            requires=s.requires,
        )
        for idx, s in enumerate(extracted)
    ]

    now = datetime.now(timezone.utc)
    doc = {
        "station_id": body.station_id,
        "filename": body.filename,
        "steps": [s.model_dump() for s in steps],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.sops.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _sop_out(doc)


# ── List SOPs for a station ────────────────────────────────────────────────────

@router.get(
    "/stations/{station_id}/sops",
    response_model=list[SopOut],
    summary="List SOPs for a station",
    description="Returns all SOP documents belonging to the given station, sorted by newest first.",
    response_description="List of SOP documents with their steps.",
)
async def list_station_sops(station_id: str):
    db = get_db()
    docs = await db.sops.find({"station_id": station_id}).sort("created_at", -1).to_list(length=None)
    return [_sop_out(d) for d in docs]


# ── Get a single SOP ──────────────────────────────────────────────────────────

@router.get(
    "/sops/{sop_id}",
    response_model=SopOut,
    summary="Get a single SOP",
    description="Fetches a specific SOP document by its MongoDB ObjectId, including all current steps.",
    response_description="The SOP document with its ordered steps.",
    responses={
        400: {"description": "Malformed `sop_id`."},
        404: {"description": "SOP not found."},
    },
)
async def get_sop(sop_id: str):
    db = get_db()
    try:
        oid = ObjectId(sop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sop_id")
    doc = await db.sops.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="SOP not found")
    return _sop_out(doc)


# ── Add a step ────────────────────────────────────────────────────────────────

@router.post(
    "/sops/{sop_id}/steps",
    response_model=SopOut,
    summary="Add a step to a SOP",
    description=(
        "Appends a new manually authored step to the end of the SOP's step list. "
        "The new step is assigned the next available `order` number."
    ),
    response_description="The updated SOP document including the new step.",
    responses={
        400: {"description": "Malformed `sop_id`."},
        404: {"description": "SOP not found."},
    },
)
async def add_step(sop_id: str, body: SopStepCreate):
    db = get_db()
    try:
        oid = ObjectId(sop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sop_id")

    doc = await db.sops.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="SOP not found")

    steps = doc.get("steps", [])
    new_step = SopStep(
        step_id=str(uuid.uuid4()),
        order=len(steps) + 1,
        title=body.title,
        description=body.description,
    )
    steps.append(new_step.model_dump())

    updated = await db.sops.find_one_and_update(
        {"_id": oid},
        {"$set": {"steps": steps, "updated_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    return _sop_out(updated)


# ── Update a step ─────────────────────────────────────────────────────────────

@router.put(
    "/sops/{sop_id}/steps/{step_id}",
    response_model=SopOut,
    summary="Edit a step",
    description=(
        "Partially updates an existing step identified by its UUID. "
        "Supply only the fields you want to change — omitted fields remain untouched."
    ),
    response_description="The updated SOP document reflecting the edited step.",
    responses={
        400: {"description": "Malformed `sop_id`."},
        404: {"description": "SOP or step not found."},
    },
)
async def update_step(sop_id: str, step_id: str, body: SopStepUpdate):
    db = get_db()
    try:
        oid = ObjectId(sop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sop_id")

    doc = await db.sops.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="SOP not found")

    steps = doc.get("steps", [])
    found = False
    for step in steps:
        if step["step_id"] == step_id:
            if body.title is not None:
                step["title"] = body.title
            if body.description is not None:
                step["description"] = body.description
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail="Step not found")

    updated = await db.sops.find_one_and_update(
        {"_id": oid},
        {"$set": {"steps": steps, "updated_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    return _sop_out(updated)


# ── Delete a step ─────────────────────────────────────────────────────────────

@router.delete(
    "/sops/{sop_id}/steps/{step_id}",
    response_model=SopOut,
    summary="Delete a step",
    description=(
        "Removes a specific step from the SOP and re-numbers the remaining steps "
        "to keep the `order` values contiguous (1, 2, 3 …)."
    ),
    response_description="The updated SOP document with the step removed and orders corrected.",
    responses={
        400: {"description": "Malformed `sop_id`."},
        404: {"description": "SOP not found."},
    },
)
async def delete_step(sop_id: str, step_id: str):
    db = get_db()
    try:
        oid = ObjectId(sop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sop_id")

    doc = await db.sops.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="SOP not found")

    steps = [s for s in doc.get("steps", []) if s["step_id"] != step_id]

    # Re-number orders after deletion
    for i, step in enumerate(steps):
        step["order"] = i + 1

    updated = await db.sops.find_one_and_update(
        {"_id": oid},
        {"$set": {"steps": steps, "updated_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    return _sop_out(updated)
