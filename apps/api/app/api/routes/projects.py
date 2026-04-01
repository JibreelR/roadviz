from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_project_repository
from app.projects.repository import ProjectRepository
from app.projects.schemas import Project, ProjectWrite

router = APIRouter(prefix="/projects", tags=["projects"])


def _read_project_or_404(
    project_id: UUID,
    repository: ProjectRepository,
) -> Project:
    project = repository.get(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectWrite,
    repository: ProjectRepository = Depends(get_project_repository),
) -> Project:
    return repository.create(project_in)


@router.get("", response_model=list[Project])
def list_projects(
    repository: ProjectRepository = Depends(get_project_repository),
) -> list[Project]:
    return repository.list()


@router.get("/{project_id}", response_model=Project)
def read_project(
    project_id: UUID,
    repository: ProjectRepository = Depends(get_project_repository),
) -> Project:
    return _read_project_or_404(project_id, repository)


@router.put("/{project_id}", response_model=Project)
def update_project(
    project_id: UUID,
    project_in: ProjectWrite,
    repository: ProjectRepository = Depends(get_project_repository),
) -> Project:
    _read_project_or_404(project_id, repository)
    updated_project = repository.update(project_id, project_in)
    if updated_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return updated_project
