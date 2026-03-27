from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime, timezone

from app.database import get_db
from app.models import StationCreate, StationRename, StationUpdate, StationOut

router = APIRouter(prefix="/api/stations", tags=["stations"])


def _station_out(doc: dict) -> StationOut:
    return StationOut(
        id=str(doc["_id"]),
        name=doc["name"],
        source_type=doc.get("source_type"),
        rtsp_url=doc.get("rtsp_url"),
        hls_url=doc.get("hls_url"),
        created_at=doc["created_at"],
    )


@router.get(
    "",
    response_model=list[StationOut],
    summary="List all stations",
    description="Returns every station sorted alphabetically by name.",
    response_description="Alphabetically ordered list of stations.",
)
async def list_stations():
    db = get_db()
    docs = await db.stations.find().sort("name", 1).to_list(length=None)
    return [_station_out(d) for d in docs]


@router.post(
    "",
    response_model=StationOut,
    status_code=201,
    summary="Create a station",
    description=(
        "Creates a new manufacturing station with the given name. "
        "Station names must be unique (case-sensitive)."
    ),
    response_description="The newly created station.",
    responses={
        409: {"description": "A station with that name already exists."},
    },
)
async def create_station(body: StationCreate):
    db = get_db()
    existing = await db.stations.find_one({"name": body.name})
    if existing:
        raise HTTPException(status_code=409, detail="Station name already exists")
    doc = {"name": body.name, "created_at": datetime.now(timezone.utc)}
    result = await db.stations.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _station_out(doc)


@router.put(
    "/{station_id}",
    response_model=StationOut,
    summary="Update a station",
    description=(
        "Updates an existing station. Supports renaming and setting the stream source "
        "(RTSP or HLS URL). Any field may be omitted to leave it unchanged. "
        "Set source_type to null to clear the stream source."
    ),
    response_description="The updated station.",
    responses={
        400: {"description": "Malformed station ID."},
        404: {"description": "Station not found."},
        409: {"description": "The new name is already taken by another station."},
    },
)
async def update_station(station_id: str, body: StationUpdate):
    db = get_db()
    try:
        oid = ObjectId(station_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid station id")

    update_fields: dict = {}

    if body.name is not None:
        conflict = await db.stations.find_one({"name": body.name, "_id": {"$ne": oid}})
        if conflict:
            raise HTTPException(status_code=409, detail="Station name already exists")
        update_fields["name"] = body.name

    for field in ("source_type", "rtsp_url", "hls_url"):
        if field in body.model_fields_set:
            update_fields[field] = getattr(body, field)

    if not update_fields:
        doc = await db.stations.find_one({"_id": oid})
        if not doc:
            raise HTTPException(status_code=404, detail="Station not found")
        return _station_out(doc)

    result = await db.stations.find_one_and_update(
        {"_id": oid},
        {"$set": update_fields},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Station not found")
    return _station_out(result)


@router.delete(
    "/{station_id}",
    status_code=204,
    summary="Delete a station",
    description=(
        "Permanently deletes a station **and all SOP documents** associated with it (cascade delete). "
        "This action cannot be undone."
    ),
    response_description="Station deleted — no content returned.",
    responses={
        204: {"description": "Station and its SOPs were deleted successfully."},
        400: {"description": "Malformed station ID."},
        404: {"description": "Station not found."},
    },
)
async def delete_station(station_id: str):
    db = get_db()
    try:
        oid = ObjectId(station_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid station id")

    result = await db.stations.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Station not found")

    await db.sops.delete_many({"station_id": station_id})
