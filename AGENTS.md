# RoadViz Agent Instructions

## Product
RoadViz is a pavement engineering web application for storing, analyzing, visualizing, mapping, and reporting pavement evaluation data.

## Target users
- DOT agencies, especially NJDOT
- Civil engineers
- Pavement engineers
- Consultants supporting DOT work

## MVP scope
Supported modules:
- GPR
- Pavement cores
- FWD
- DCP

Supported users:
- Engineer
- Client read-only

Supported outputs:
- PDF reports and graphs
- Excel analyzed data
- HTML outputs for analyzed data, graphs, and maps

## Product constraints
- Single-tenant first
- Containerized local development
- Beginner-friendly setup
- Production-ready code
- Step-by-step implementation
- Windows-friendly instructions
- Designed for ChatGPT Projects + Codex workflow

## Architecture target
- Frontend: Next.js + TypeScript
- Backend: FastAPI + Python
- Database: PostgreSQL + PostGIS
- Background jobs later: Redis + Celery
- Local development: Docker Compose

## Data/input requirements
- Support XLSX and CSV uploads
- Support manual table entry/editing
- Support GPS plus station/MP linear referencing
- Support points, lines, and road segments/polygons
- Preserve original uploaded files
- Preserve raw row data when normalizing
- Keep parsing, validation, normalization, analysis, and reporting modular

## Coding rules
- Write production-ready code
- Keep files modular and readable
- Use type hints where practical
- Add docstrings/comments where helpful
- Avoid unnecessary features
- Prefer explicit configuration over hidden magic
- Do not overwrite user work without saying so
- Update README when setup steps change

## Workflow rules
Before making changes:
1. Read this file
2. Inspect the current repo
3. State which files you plan to create or edit
4. Make the smallest clean change that completes the task

After making changes:
1. Summarize what changed
2. List files created/edited
3. Give run/test instructions
4. Flag anything still missing or assumed

## Initial build priority
1. Monorepo scaffold
2. Docker Compose dev setup
3. FastAPI backend scaffold
4. Next.js frontend scaffold
5. README and .env.example
6. Then project CRUD and upload pipeline