from __future__ import annotations

from threading import Lock
from typing import Protocol
from uuid import UUID, uuid4

from app.projects.schemas import Project, ProjectWrite, utc_now


class ProjectRepository(Protocol):
    def create(self, project_in: ProjectWrite) -> Project: ...

    def list(self) -> list[Project]: ...

    def get(self, project_id: UUID) -> Project | None: ...

    def update(self, project_id: UUID, project_in: ProjectWrite) -> Project | None: ...


class InMemoryProjectRepository:
    """A simple repository interface that can later be replaced with a database-backed implementation."""

    def __init__(self) -> None:
        self._projects: dict[UUID, Project] = {}
        self._lock = Lock()

    def create(self, project_in: ProjectWrite) -> Project:
        timestamp = utc_now()
        project = Project(
            id=uuid4(),
            created_at=timestamp,
            updated_at=timestamp,
            **project_in.model_dump(),
        )

        with self._lock:
            self._projects[project.id] = project

        return project.model_copy(deep=True)

    def list(self) -> list[Project]:
        with self._lock:
            projects = [
                project.model_copy(deep=True)
                for project in self._projects.values()
            ]

        return sorted(projects, key=lambda project: project.created_at, reverse=True)

    def get(self, project_id: UUID) -> Project | None:
        with self._lock:
            project = self._projects.get(project_id)

        if project is None:
            return None

        return project.model_copy(deep=True)

    def update(self, project_id: UUID, project_in: ProjectWrite) -> Project | None:
        with self._lock:
            existing = self._projects.get(project_id)
            if existing is None:
                return None

            updated_project = existing.model_copy(
                update={
                    **project_in.model_dump(),
                    "updated_at": utc_now(),
                },
                deep=True,
            )
            self._projects[project_id] = updated_project

        return updated_project.model_copy(deep=True)
