import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

from app.api.routes.enrichment import router as enrichment_router
from app.api.routes.projects import router as projects_router
from app.api.routes.schema_templates import router as schema_templates_router
from app.api.routes.upload_mapping import router as upload_mapping_router
from app.api.routes.uploads import router as uploads_router
from app.db.connection import Database
from app.db.schema import DatabaseSchemaManager
from app.enrichment.db_repository import DatabaseEnrichmentRepository
from app.mapping_definitions.service import MappingDefinitionService
from app.normalization.db_repository import DatabaseNormalizedUploadRepository
from app.parsing.service import UploadParsingService
from app.projects.db_repository import DatabaseProjectRepository
from app.schema_templates.db_repository import DatabaseSchemaTemplateRepository
from app.upload_mappings.db_repository import DatabaseUploadMappingRepository
from app.uploads.db_repository import DatabaseUploadRepository
from app.uploads.storage import LocalUploadStorage

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://roadviz:roadviz_dev_password@localhost:5432/roadviz",
)
database = Database(DATABASE_URL)
schema_manager = DatabaseSchemaManager(database)


@asynccontextmanager
async def lifespan(app: FastAPI):
    schema_manager.initialize()
    app.state.database = database
    app.state.project_repository = DatabaseProjectRepository(database)
    app.state.upload_repository = DatabaseUploadRepository(database)
    app.state.schema_template_repository = DatabaseSchemaTemplateRepository(database)
    app.state.mapping_definition_service = MappingDefinitionService()
    app.state.upload_parsing_service = UploadParsingService()
    app.state.upload_mapping_repository = DatabaseUploadMappingRepository(database)
    app.state.normalized_upload_repository = DatabaseNormalizedUploadRepository(database)
    app.state.enrichment_repository = DatabaseEnrichmentRepository(database)
    app.state.upload_file_storage = LocalUploadStorage(
        Path(__file__).resolve().parents[1] / ".storage" / "uploads"
    )
    yield


app = FastAPI(
    title="RoadViz API",
    version="0.1.0",
    description="RoadViz MVP API with foundational Project CRUD support.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(uploads_router)
app.include_router(schema_templates_router)
app.include_router(upload_mapping_router)
app.include_router(enrichment_router)


@app.get("/", tags=["meta"])
def read_root() -> dict[str, str]:
    return {
        "name": "RoadViz API",
        "status": "scaffolded",
    }


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
