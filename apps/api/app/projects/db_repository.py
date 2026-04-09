from __future__ import annotations

from uuid import UUID, uuid4

from app.db.connection import Database
from app.projects.schemas import Project, ProjectWrite, utc_now


class DatabaseProjectRepository:
    """Persist project records in PostgreSQL."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def create(self, project_in: ProjectWrite) -> Project:
        timestamp = utc_now()
        project = Project(
            id=uuid4(),
            created_at=timestamp,
            updated_at=timestamp,
            **project_in.model_dump(),
        )

        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO projects (
                        id,
                        project_code,
                        name,
                        client_name,
                        route,
                        roadway,
                        direction,
                        county,
                        state,
                        start_mp,
                        end_mp,
                        start_station,
                        end_station,
                        description,
                        status,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        %(id)s,
                        %(project_code)s,
                        %(name)s,
                        %(client_name)s,
                        %(route)s,
                        %(roadway)s,
                        %(direction)s,
                        %(county)s,
                        %(state)s,
                        %(start_mp)s,
                        %(end_mp)s,
                        %(start_station)s,
                        %(end_station)s,
                        %(description)s,
                        %(status)s,
                        %(created_at)s,
                        %(updated_at)s
                    )
                    """,
                    {
                        "id": project.id,
                        "project_code": project.project_code,
                        "name": project.name,
                        "client_name": project.client_name,
                        "route": project.route,
                        "roadway": project.roadway,
                        "direction": project.direction,
                        "county": project.county,
                        "state": project.state,
                        "start_mp": project.start_mp,
                        "end_mp": project.end_mp,
                        "start_station": project.start_station,
                        "end_station": project.end_station,
                        "description": project.description,
                        "status": project.status.value,
                        "created_at": project.created_at,
                        "updated_at": project.updated_at,
                    },
                )

        return project

    def list(self) -> list[Project]:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        id,
                        project_code,
                        name,
                        client_name,
                        route,
                        roadway,
                        direction,
                        county,
                        state,
                        start_mp,
                        end_mp,
                        start_station,
                        end_station,
                        description,
                        status,
                        created_at,
                        updated_at
                    FROM projects
                    ORDER BY created_at DESC
                    """
                )
                rows = cursor.fetchall()

        return [Project.model_validate(row) for row in rows]

    def get(self, project_id: UUID) -> Project | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        id,
                        project_code,
                        name,
                        client_name,
                        route,
                        roadway,
                        direction,
                        county,
                        state,
                        start_mp,
                        end_mp,
                        start_station,
                        end_station,
                        description,
                        status,
                        created_at,
                        updated_at
                    FROM projects
                    WHERE id = %s
                    """,
                    (project_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None
        return Project.model_validate(row)

    def update(self, project_id: UUID, project_in: ProjectWrite) -> Project | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE projects
                    SET
                        project_code = %(project_code)s,
                        name = %(name)s,
                        client_name = %(client_name)s,
                        route = %(route)s,
                        roadway = %(roadway)s,
                        direction = %(direction)s,
                        county = %(county)s,
                        state = %(state)s,
                        start_mp = %(start_mp)s,
                        end_mp = %(end_mp)s,
                        start_station = %(start_station)s,
                        end_station = %(end_station)s,
                        description = %(description)s,
                        status = %(status)s,
                        updated_at = %(updated_at)s
                    WHERE id = %(project_id)s
                    RETURNING
                        id,
                        project_code,
                        name,
                        client_name,
                        route,
                        roadway,
                        direction,
                        county,
                        state,
                        start_mp,
                        end_mp,
                        start_station,
                        end_station,
                        description,
                        status,
                        created_at,
                        updated_at
                    """,
                    {
                        **project_in.model_dump(),
                        "status": project_in.status.value,
                        "updated_at": utc_now(),
                        "project_id": project_id,
                    },
                )
                row = cursor.fetchone()

        if row is None:
            return None
        return Project.model_validate(row)
