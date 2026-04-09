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

Keep `NEXT_PUBLIC_API_BASE_URL` pointed to a browser-reachable address for local development:

- Use `http://localhost:8000`
- Do not use the Docker service hostname such as `http://api:8000` in the frontend env, because the browser cannot resolve that name

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
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile verification run --rm web-verify
```

Use the `web-verify` command for frontend build verification. Do not run `docker compose exec web npm run build` against the live `web` dev container, because `next dev` and `next build` both write to `.next` and can leave the running dev server out of sync.

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

The repository now includes the first MVP product object:

- Project CRUD foundation in the FastAPI backend with PostgreSQL-backed persistence
- Upload intake records tied to projects with local source-file storage and database-backed metadata
- Schema templates for supported pavement data types
- Real CSV/XLSX upload preview, source-to-canonical mapping, and validation foundation
- Mapping-driven normalization foundation for GPR, core, FWD, and DCP uploads with persisted mappings and normalization results
- A Next.js Projects and Uploads workflow for creating records and mapping source columns

Uploaded source files are stored locally under `apps/api/.storage/uploads` during local development. The API now stores project records, upload metadata, GPR upload configuration, schema templates, upload mappings, and normalization results in PostgreSQL on startup using a minimal built-in schema bootstrap.

It does not yet include engineering analysis workflows, authentication, cloud file storage, or reporting pipelines.

## Mapping Foundation Verification

From the repository root after the Docker stack is running:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml exec api python -m unittest discover -s tests -p "test_*.py"
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile verification run --rm web-verify
```

Frontend verification must use the isolated `web-verify` container. Do not run `docker compose exec web npm run build`, because it shares the live dev container `.next` directory and can leave `next dev` in a broken state with runtime module errors.

Then in the browser:

1. Open `http://localhost:3000/projects`
2. Create or open a project
3. Go to the Uploads page and record a CSV or XLSX upload
4. Use the `Map columns` action for that upload
5. Confirm the page shows real parsed source columns, sample rows, canonical RoadViz fields, saveable mappings, and validation feedback
