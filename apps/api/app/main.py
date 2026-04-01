from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

from app.api.routes.projects import router as projects_router
from app.api.routes.schema_templates import router as schema_templates_router
from app.api.routes.upload_mapping import router as upload_mapping_router
from app.api.routes.uploads import router as uploads_router
from app.mapping_definitions.service import MappingDefinitionService
from app.projects.repository import InMemoryProjectRepository
from app.schema_templates.repository import InMemorySchemaTemplateRepository
from app.upload_mappings.repository import InMemoryUploadMappingRepository
from app.uploads.repository import InMemoryUploadRepository

app = FastAPI(
    title="RoadViz API",
    version="0.1.0",
    description="RoadViz MVP API with foundational Project CRUD support.",
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

app.state.project_repository = InMemoryProjectRepository()
app.state.upload_repository = InMemoryUploadRepository()
app.state.schema_template_repository = InMemorySchemaTemplateRepository()
app.state.mapping_definition_service = MappingDefinitionService()
app.state.upload_mapping_repository = InMemoryUploadMappingRepository()
app.include_router(projects_router)
app.include_router(uploads_router)
app.include_router(schema_templates_router)
app.include_router(upload_mapping_router)


@app.get("/", tags=["meta"])
def read_root() -> dict[str, str]:
    return {
        "name": "RoadViz API",
        "status": "scaffolded",
    }


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
