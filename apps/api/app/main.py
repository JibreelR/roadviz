from fastapi import FastAPI

app = FastAPI(
    title="RoadViz API",
    version="0.1.0",
    description="Initial FastAPI scaffold for the RoadViz MVP.",
)


@app.get("/", tags=["meta"])
def read_root() -> dict[str, str]:
    return {
        "name": "RoadViz API",
        "status": "scaffolded",
    }


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
