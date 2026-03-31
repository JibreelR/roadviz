# RoadViz

RoadViz is a pavement engineering web application for storing, analyzing, visualizing, mapping, and reporting pavement evaluation data.

This repository contains the initial MVP scaffold:

- `apps/web`: Next.js + TypeScript frontend
- `apps/api`: FastAPI backend
- `infra/compose`: local Docker Compose stack
- `docs`: project notes and implementation documentation

## Stack

- Frontend: Next.js + TypeScript
- Backend: FastAPI + Python
- Database: PostgreSQL + PostGIS
- Local development: Docker Compose

## Prerequisites

For Windows development, install:

- Docker Desktop
- PowerShell
- Docker Desktop must be running before you start the stack

## Quick Start (Windows PowerShell)

From the repository root:

```powershell
cd C:\Users\jibre\Documents\roadviz
Copy-Item .env.example .env -Force
docker compose --env-file .env -f infra/compose/docker-compose.yml up --build
```

The first build may take a few minutes while Docker downloads the base images and installs dependencies.

After the services start, verify:

- Web app: `http://localhost:3000`
- API root: `http://localhost:8000`
- API health check: `http://localhost:8000/health`
- API docs: `http://localhost:8000/docs`
- PostGIS: `localhost:5432`

You can also verify from PowerShell:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty Content
docker compose --env-file .env -f infra/compose/docker-compose.yml exec api python -m unittest discover -s tests -p "test_*.py"
```

To stop the stack:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

To stop and remove the local PostGIS volume:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml down -v
```

## Repository Layout

```text
apps/
  api/
  web/
docs/
infra/
  compose/
```

## Current Scope

This is only the initial scaffold. It does not yet include project CRUD, upload parsing, validation, normalization, analysis workflows, authentication, or reporting pipelines.
