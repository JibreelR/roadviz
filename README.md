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

- Project CRUD foundation in the FastAPI backend with an in-memory repository
- Upload intake records tied to projects
- Schema templates for supported pavement data types
- Upload preview, source-to-canonical mapping, and validation foundation
- A Next.js Projects and Uploads workflow for creating records and mapping source columns

It does not yet include upload parsing, validation, normalization, analysis workflows, authentication, or reporting pipelines.

## Mapping Foundation Verification

From the repository root after the Docker stack is running:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml exec api python -m unittest discover -s tests -p "test_*.py"
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile verification run --rm web-verify
```

Then in the browser:

1. Open `http://localhost:3000/projects`
2. Create or open a project
3. Go to the Uploads page and record a CSV or XLSX upload
4. Use the new `Map columns` action for that upload
5. Confirm the page shows upload metadata, stub preview columns, canonical RoadViz fields, saveable mappings, and validation feedback
