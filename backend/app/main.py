from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from contextlib import asynccontextmanager

from app.database import connect_db, close_db
from app.routes import stations, sop, dev


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


_DESCRIPTION = """
## MQA Backend API

Core REST API for the **Manufacturing Quality Assurance** platform.

### Capabilities

* **Stations** — manage named manufacturing stations that group SOP documents.
* **SOP Processing** — upload raw SOP text; GPT-4o-mini extracts structured steps and persists them to MongoDB.
* **Step Management** — add, edit, or remove individual steps from any processed SOP document.

### Interactive docs
| UI | URL |
|----|-----|
| Swagger UI | [`/docs`](/docs) |
| ReDoc | [`/redoc`](/redoc) |
| OpenAPI JSON | [`/openapi.json`](/openapi.json) |
"""

_TAGS = [
    {
        "name": "health",
        "description": "Service liveness probe.",
    },
    {
        "name": "stations",
        "description": (
            "CRUD operations for manufacturing stations. "
            "Each station acts as a logical container for one or more SOP documents. "
            "Deleting a station cascades to all its SOPs."
        ),
    },
    {
        "name": "sop",
        "description": (
            "SOP document processing and step-level management. "
            "**POST /api/sop/process** sends raw SOP text to OpenAI for structured extraction "
            "and stores the result in MongoDB. Individual steps can then be added, edited, or deleted."
        ),
    },
]

app = FastAPI(
    title="MQA Backend",
    version="1.0.0",
    description=_DESCRIPTION,
    openapi_tags=_TAGS,
    contact={
        "name": "tata Motors — MQA Team",
    },
    license_info={
        "name": "Proprietary",
    },
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stations.router)
app.include_router(sop.router)
app.include_router(dev.router)


@app.get(
    "/health",
    tags=["health"],
    summary="Health check",
    description="Returns `{\"status\": \"ok\"}` when the service is running.",
    response_description="Service is healthy",
)
async def health():
    return {"status": "ok"}
