from __future__ import annotations

from threading import Lock
from typing import Protocol
from uuid import UUID

from app.enrichment.schemas import (
    EnrichedResultSet,
    GprMovingAverageResultSet,
    ProjectStationMilepostTieTable,
    UploadDistanceStationTieTable,
)


class EnrichmentRepository(Protocol):
    def get_project_station_milepost_tie_table(
        self,
        project_id: UUID,
    ) -> ProjectStationMilepostTieTable | None: ...

    def save_project_station_milepost_tie_table(
        self,
        tie_table: ProjectStationMilepostTieTable,
    ) -> ProjectStationMilepostTieTable: ...

    def get_upload_distance_station_tie_table(
        self,
        upload_id: UUID,
    ) -> UploadDistanceStationTieTable | None: ...

    def save_upload_distance_station_tie_table(
        self,
        tie_table: UploadDistanceStationTieTable,
    ) -> UploadDistanceStationTieTable: ...

    def get_enriched_result(
        self,
        upload_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> EnrichedResultSet | None: ...

    def save_enriched_result(self, result: EnrichedResultSet) -> EnrichedResultSet: ...

    def get_moving_average_result(
        self,
        upload_id: UUID,
        result_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> GprMovingAverageResultSet | None: ...

    def save_moving_average_result(
        self,
        result: GprMovingAverageResultSet,
    ) -> GprMovingAverageResultSet: ...


class InMemoryEnrichmentRepository:
    """Retain tie tables, enriched rows, and analysis runs for route-level tests."""

    def __init__(self) -> None:
        self._project_station_milepost_tie_tables: dict[
            UUID, ProjectStationMilepostTieTable
        ] = {}
        self._upload_distance_station_tie_tables: dict[
            UUID, UploadDistanceStationTieTable
        ] = {}
        self._enriched_results: dict[UUID, EnrichedResultSet] = {}
        self._moving_average_results: dict[tuple[UUID, UUID], GprMovingAverageResultSet] = {}
        self._lock = Lock()

    def get_project_station_milepost_tie_table(
        self,
        project_id: UUID,
    ) -> ProjectStationMilepostTieTable | None:
        with self._lock:
            tie_table = self._project_station_milepost_tie_tables.get(project_id)

        if tie_table is None:
            return None
        return tie_table.model_copy(deep=True)

    def save_project_station_milepost_tie_table(
        self,
        tie_table: ProjectStationMilepostTieTable,
    ) -> ProjectStationMilepostTieTable:
        with self._lock:
            self._project_station_milepost_tie_tables[tie_table.project_id] = (
                tie_table.model_copy(deep=True)
            )

        return tie_table.model_copy(deep=True)

    def get_upload_distance_station_tie_table(
        self,
        upload_id: UUID,
    ) -> UploadDistanceStationTieTable | None:
        with self._lock:
            tie_table = self._upload_distance_station_tie_tables.get(upload_id)

        if tie_table is None:
            return None
        return tie_table.model_copy(deep=True)

    def save_upload_distance_station_tie_table(
        self,
        tie_table: UploadDistanceStationTieTable,
    ) -> UploadDistanceStationTieTable:
        with self._lock:
            self._upload_distance_station_tie_tables[tie_table.upload_id] = (
                tie_table.model_copy(deep=True)
            )

        return tie_table.model_copy(deep=True)

    def get_enriched_result(
        self,
        upload_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> EnrichedResultSet | None:
        with self._lock:
            result = self._enriched_results.get(upload_id)

        if result is None:
            return None

        rows = result.rows[offset : offset + limit] if limit > 0 else []
        return result.model_copy(
            update={
                "rows": rows,
                "rows_offset": offset,
                "rows_limit": limit,
                "returned_row_count": len(rows),
                "has_more_rows": offset + len(rows) < result.enriched_row_count,
            },
            deep=True,
        )

    def save_enriched_result(self, result: EnrichedResultSet) -> EnrichedResultSet:
        with self._lock:
            self._enriched_results[result.upload_id] = result.model_copy(deep=True)

        return result.model_copy(deep=True)

    def get_moving_average_result(
        self,
        upload_id: UUID,
        result_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> GprMovingAverageResultSet | None:
        with self._lock:
            result = self._moving_average_results.get((upload_id, result_id))

        if result is None:
            return None

        points = result.points[offset : offset + limit] if limit > 0 else []
        return result.model_copy(
            update={
                "points": points,
                "points_offset": offset,
                "points_limit": limit,
                "returned_point_count": len(points),
                "has_more_points": offset + len(points) < result.point_count,
            },
            deep=True,
        )

    def save_moving_average_result(
        self,
        result: GprMovingAverageResultSet,
    ) -> GprMovingAverageResultSet:
        with self._lock:
            self._moving_average_results[(result.upload_id, result.id)] = result.model_copy(
                deep=True
            )

        return result.model_copy(deep=True)
