from fastapi import FastAPI

from app.api.routes.projects import router as projects_router
from app.projects.repository import InMemoryProjectRepository

app = FastAPI(
    title="RoadViz API",
    version="0.1.0",
    description="RoadViz MVP API with foundational Project CRUD support.",
)

app.state.project_repository = InMemoryProjectRepository()
app.include_router(projects_router)


@app.get("/", tags=["meta"])
def read_root() -> dict[str, str]:
    return {
        "name": "RoadViz API",
        "status": "scaffolded",
    }


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
