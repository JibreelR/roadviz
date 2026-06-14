from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class LinearReferenceMode(StrEnum):
    STATIONS_ONLY = "stations_only"
    STATIONS_MILEPOSTS = "stations_mileposts"


def parse_station_value(station: str) -> float:
    """Parse plain numeric or civil-format station text into a comparable numeric value."""
    normalized = station.strip().replace(" ", "")
    if "+" not in normalized:
        try:
            return float(normalized)
        except ValueError as exc:
            raise ValueError(
                "Station must be numeric or use civil station format such as 123+45.67."
            ) from exc

    station_part, offset_part = normalized.split("+", 1)
    try:
        station_number = int(station_part)
        offset = float(offset_part)
    except ValueError as exc:
        raise ValueError(
            "Station must be numeric or use civil station format such as 123+45.67."
        ) from exc

    sign = -1 if station_number < 0 else 1
    return station_number * 100 + sign * offset


class ProjectExcludedSegment(BaseModel):
    stop_station: str = Field(..., min_length=1, max_length=100)
    resume_station: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)

    @field_validator("stop_station", "resume_station")
    @classmethod
    def normalize_required_station(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Station cannot be blank.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ProjectWrite(BaseModel):
    project_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    lane_count: int = Field(default=1, ge=1, le=24)
    has_outside_shoulder: bool = False
    has_inside_shoulder: bool = False
    ramp_count: int = Field(default=0, ge=0, le=24)
    linear_reference_mode: LinearReferenceMode = LinearReferenceMode.STATIONS_MILEPOSTS
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
    excluded_segments: list[ProjectExcludedSegment] = Field(default_factory=list)
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

    @model_validator(mode="after")
    def validate_station_ranges(self) -> "ProjectWrite":
        if self.start_station is None and self.end_station is None:
            if self.excluded_segments:
                raise ValueError(
                    "Project begin and end station are required before excluded segments."
                )
            return self

        if self.start_station is None or self.end_station is None:
            if self.excluded_segments:
                raise ValueError(
                    "Project begin and end station are required before excluded segments."
                )
            return self

        begin_station_value = parse_station_value(self.start_station)
        end_station_value = parse_station_value(self.end_station)
        if begin_station_value >= end_station_value:
            raise ValueError("Project begin station must be less than project end station.")

        for segment in self.excluded_segments:
            stop_station_value = parse_station_value(segment.stop_station)
            resume_station_value = parse_station_value(segment.resume_station)

            if stop_station_value >= resume_station_value:
                raise ValueError(
                    "Excluded segment stop station must be less than resume station."
                )
            if stop_station_value < begin_station_value or resume_station_value > end_station_value:
                raise ValueError(
                    "Excluded segments must stay within the project begin and end station limits."
                )

        return self


class Project(ProjectWrite):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
