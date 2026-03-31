import unittest
from uuid import uuid4

from fastapi import HTTPException

from app.api.routes.projects import (
    create_project,
    list_projects,
    read_project,
    update_project,
)
from app.main import app
from app.projects.repository import InMemoryProjectRepository
from app.projects.schemas import ProjectStatus, ProjectWrite


class ProjectCrudTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = InMemoryProjectRepository()
        self.project_payload = ProjectWrite(
            project_code="NJDOT-001",
            name="I-80 Corridor Survey",
            client_name="NJDOT",
            route="I-80",
            roadway="Mainline",
            direction="EB",
            county="Morris",
            state="NJ",
            start_mp=12.3,
            end_mp=18.7,
            start_station="123+00",
            end_station="187+00",
            description="Initial pavement evaluation project.",
            status=ProjectStatus.DRAFT,
        )

    def test_create_and_list_project(self) -> None:
        created_project = create_project(self.project_payload, self.repository)
        projects = list_projects(self.repository)

        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0].id, created_project.id)
        self.assertEqual(projects[0].project_code, "NJDOT-001")
        self.assertEqual(projects[0].status, ProjectStatus.DRAFT)

    def test_read_and_update_project(self) -> None:
        created_project = create_project(self.project_payload, self.repository)

        loaded_project = read_project(created_project.id, self.repository)
        self.assertEqual(loaded_project.name, "I-80 Corridor Survey")

        updated_project = update_project(
            created_project.id,
            ProjectWrite(
                project_code="NJDOT-001",
                name="I-80 Corridor Survey Phase 1",
                client_name="NJDOT",
                route="I-80",
                roadway="Mainline",
                direction="EB",
                county="Morris",
                state="NJ",
                start_mp=12.3,
                end_mp=18.7,
                start_station="123+00",
                end_station="187+00",
                description="Updated scope for the first project phase.",
                status=ProjectStatus.ACTIVE,
            ),
            self.repository,
        )

        self.assertEqual(updated_project.name, "I-80 Corridor Survey Phase 1")
        self.assertEqual(updated_project.status, ProjectStatus.ACTIVE)
        self.assertGreater(updated_project.updated_at, updated_project.created_at)

    def test_missing_project_returns_404(self) -> None:
        with self.assertRaises(HTTPException) as context:
            read_project(uuid4(), self.repository)

        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(context.exception.detail, "Project not found.")

    def test_project_routes_registered(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/projects", paths)
        self.assertIn("/projects/{project_id}", paths)


if __name__ == "__main__":
    unittest.main()
