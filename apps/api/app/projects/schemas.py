from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ProjectWrite(BaseModel):
    project_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    client_name: str | None = Field(default=None, max_length=200)
    route: str | None = Field(default=None, max_length=100)
    roadway: str | None = Field(default=None, max_length=200)
    direction: str | None = Field(default=None, max_length=50)
    county: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=50)
    start_mp: float | None = None
    end_mp: float | None = None
    start_station: str | None = Field(default=None, max_length=100)
    end_station: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    status: ProjectStatus = ProjectStatus.DRAFT

    @field_validator("project_code", "name")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field cannot be blank.")
        return normalized

    @field_validator(
        "client_name",
        "route",
        "roadway",
        "direction",
        "county",
        "state",
        "start_station",
        "end_station",
        "description",
    )
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class Project(ProjectWrite):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
