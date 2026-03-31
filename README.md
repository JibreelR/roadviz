# RoadViz

RoadViz is a pavement engineering web application for storing, analyzing, visualizing, mapping, and reporting pavement evaluation data.

This repository now contains the initial MVP scaffold:

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

## Quick Start (Windows PowerShell)

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f infra/compose/docker-compose.yml up --build
```

After the services start:

- Web app: `http://localhost:3000`
- API root: `http://localhost:8000`
- API health check: `http://localhost:8000/health`
- API docs: `http://localhost:8000/docs`
- PostGIS: `localhost:5432`

To stop the stack:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml down
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
