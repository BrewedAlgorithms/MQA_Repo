from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ── Stations ──────────────────────────────────────────────────────────────────

class StationCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Unique display name for the station.",
        examples=["ASSEMBLY_LINE_ALPHA_01"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {"name": "ASSEMBLY_LINE_ALPHA_01"}
        }
    }


class StationRename(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="New display name for the station. Must be unique.",
        examples=["FABRICATION_HUB_BETA"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {"name": "FABRICATION_HUB_BETA"}
        }
    }


class StationOut(BaseModel):
    id: str = Field(..., description="MongoDB ObjectId as a hex string.", examples=["664f1a2b3c4d5e6f7a8b9c0d"])
    name: str = Field(..., description="Station display name.", examples=["ASSEMBLY_LINE_ALPHA_01"])
    created_at: datetime = Field(..., description="UTC timestamp of creation.")


# ── SOP Steps ─────────────────────────────────────────────────────────────────

class SopStep(BaseModel):
    step_id: str = Field(..., description="UUID v4 identifier for this step.", examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"])
    order: int = Field(..., ge=1, description="1-based position of this step in the sequence.", examples=[1])
    title: str = Field(..., description="Short action title.", examples=["Check Seal Integrity"])
    description: str = Field(..., description="Full description of what must be done.", examples=["Inspect secondary gasket layer for micro-fissures or pressure deviations."])
    requires: List[str] = Field(default=[], description="Titles of prerequisite steps that must be completed first.", examples=[[]])


class SopStepCreate(BaseModel):
    title: str = Field(..., min_length=1, description="Short action title for the new step.", examples=["Final Visual Pass"])
    description: str = Field(default="", description="Detailed description of what must be done.", examples=["High-resolution optical scan for surface defects or FOD."])

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Final Visual Pass",
                "description": "High-resolution optical scan for surface defects or left-behind FOD.",
            }
        }
    }


class SopStepUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, description="Updated step title. Omit to leave unchanged.", examples=["Torque Calibration"])
    description: Optional[str] = Field(default=None, description="Updated step description. Omit to leave unchanged.", examples=["Apply 14.5 Nm to the primary intake housing bolts."])

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Torque Calibration",
                "description": "Apply precise force of 14.5 Nm to the primary intake housing bolts.",
            }
        }
    }


# ── SOP Documents ─────────────────────────────────────────────────────────────

class SopProcessRequest(BaseModel):
    station_id: str = Field(
        ...,
        description="MongoDB ObjectId of the target station.",
        examples=["664f1a2b3c4d5e6f7a8b9c0d"],
    )
    sop_text: str = Field(
        ...,
        min_length=1,
        description="Full plain-text content of the SOP document to process.",
        examples=["Step 1: Inspect gasket...\nStep 2: Torque bolts to 14.5 Nm..."],
    )
    filename: Optional[str] = Field(
        default=None,
        description="Original file name for reference (e.g. 'assembly_sop_v3.txt').",
        examples=["assembly_sop_v3.txt"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "station_id": "664f1a2b3c4d5e6f7a8b9c0d",
                "sop_text": "Step 1: Inspect the gasket layer for fissures.\nStep 2: Torque bolts to 14.5 Nm.\nStep 3: Final visual scan for FOD.",
                "filename": "assembly_sop_v3.txt",
            }
        }
    }


class SopOut(BaseModel):
    id: str = Field(..., description="MongoDB ObjectId of this SOP document.", examples=["665a2b3c4d5e6f7a8b9c0d1e"])
    station_id: str = Field(..., description="ObjectId of the owning station.", examples=["664f1a2b3c4d5e6f7a8b9c0d"])
    filename: Optional[str] = Field(default=None, description="Original filename if provided.", examples=["assembly_sop_v3.txt"])
    steps: List[SopStep] = Field(..., description="Ordered list of extracted/edited SOP steps.")
    created_at: datetime = Field(..., description="UTC timestamp when this SOP was first processed.")
    updated_at: datetime = Field(..., description="UTC timestamp of the last step edit.")
