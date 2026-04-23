from __future__ import annotations

from uuid import UUID

from psycopg.types.json import Jsonb

from app.db.connection import Database
from app.db.serialization import (
    dump_models,
    load_enriched_rows,
    load_gpr_moving_average_points,
    load_project_station_milepost_tie_rows,
    load_upload_distance_station_tie_rows,
)
from app.enrichment.schemas import (
    EnrichedResultSet,
    GprMovingAverageResultSet,
    ProjectStationMilepostTieTable,
    UploadDistanceStationTieTable,
)


class DatabaseEnrichmentRepository:
    """Persist tie tables, enriched rows, and first-pass analysis outputs."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def get_project_station_milepost_tie_table(
        self,
        project_id: UUID,
    ) -> ProjectStationMilepostTieTable | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT project_id, updated_at, rows
                    FROM project_station_milepost_tie_tables
                    WHERE project_id = %s
                    """,
                    (project_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        return ProjectStationMilepostTieTable.model_validate(
            {
                **row,
                "rows": [
                    item.model_dump(mode="json")
                    for item in load_project_station_milepost_tie_rows(row["rows"])
                ],
            }
        )

    def save_project_station_milepost_tie_table(
        self,
        tie_table: ProjectStationMilepostTieTable,
    ) -> ProjectStationMilepostTieTable:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO project_station_milepost_tie_tables (
                        project_id,
                        updated_at,
                        rows
                    )
                    VALUES (%s, %s, %s)
                    ON CONFLICT (project_id)
                    DO UPDATE SET
                        updated_at = EXCLUDED.updated_at,
                        rows = EXCLUDED.rows
                    """,
                    (
                        tie_table.project_id,
                        tie_table.updated_at,
                        Jsonb(dump_models(tie_table.rows)),
                    ),
                )

        return tie_table.model_copy(deep=True)

    def get_upload_distance_station_tie_table(
        self,
        upload_id: UUID,
    ) -> UploadDistanceStationTieTable | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT upload_id, project_id, updated_at, rows
                    FROM upload_distance_station_tie_tables
                    WHERE upload_id = %s
                    """,
                    (upload_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        return UploadDistanceStationTieTable.model_validate(
            {
                **row,
                "rows": [
                    item.model_dump(mode="json")
                    for item in load_upload_distance_station_tie_rows(row["rows"])
                ],
            }
        )

    def save_upload_distance_station_tie_table(
        self,
        tie_table: UploadDistanceStationTieTable,
    ) -> UploadDistanceStationTieTable:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO upload_distance_station_tie_tables (
                        upload_id,
                        project_id,
                        updated_at,
                        rows
                    )
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (upload_id)
                    DO UPDATE SET
                        project_id = EXCLUDED.project_id,
                        updated_at = EXCLUDED.updated_at,
                        rows = EXCLUDED.rows
                    """,
                    (
                        tie_table.upload_id,
                        tie_table.project_id,
                        tie_table.updated_at,
                        Jsonb(dump_models(tie_table.rows)),
                    ),
                )

        return tie_table.model_copy(deep=True)

    def get_enriched_result(
        self,
        upload_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> EnrichedResultSet | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        upload_id,
                        data_type,
                        enriched_at,
                        normalized_row_count,
                        enriched_row_count,
                        skipped_row_count,
                        preview_rows,
                        rows
                    FROM enriched_uploads
                    WHERE upload_id = %s
                    """,
                    (upload_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        paged_rows = []
        if limit > 0:
            with self._database.connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COALESCE(
                            (
                                SELECT jsonb_agg(item.value ORDER BY item.ordinality)
                                FROM jsonb_array_elements(enriched_uploads.rows)
                                    WITH ORDINALITY AS item(value, ordinality)
                                WHERE item.ordinality > %s
                                  AND item.ordinality <= %s
                            ),
                            '[]'::jsonb
                        ) AS rows
                        FROM enriched_uploads
                        WHERE upload_id = %s
                        """,
                        (offset, offset + limit, upload_id),
                    )
                    rows_result = cursor.fetchone()
            paged_rows = load_enriched_rows(rows_result["rows"] if rows_result else [])

        return EnrichedResultSet.model_validate(
            {
                **row,
                "preview_rows": [
                    item.model_dump(mode="json")
                    for item in load_enriched_rows(row["preview_rows"])
                ],
                "rows": [item.model_dump(mode="json") for item in paged_rows],
                "rows_offset": offset,
                "rows_limit": limit,
                "returned_row_count": len(paged_rows),
                "has_more_rows": offset + len(paged_rows) < row["enriched_row_count"],
            }
        )

    def save_enriched_result(self, result: EnrichedResultSet) -> EnrichedResultSet:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO enriched_uploads (
                        upload_id,
                        data_type,
                        enriched_at,
                        normalized_row_count,
                        enriched_row_count,
                        skipped_row_count,
                        preview_rows,
                        rows
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (upload_id)
                    DO UPDATE SET
                        data_type = EXCLUDED.data_type,
                        enriched_at = EXCLUDED.enriched_at,
                        normalized_row_count = EXCLUDED.normalized_row_count,
                        enriched_row_count = EXCLUDED.enriched_row_count,
                        skipped_row_count = EXCLUDED.skipped_row_count,
                        preview_rows = EXCLUDED.preview_rows,
                        rows = EXCLUDED.rows
                    """,
                    (
                        result.upload_id,
                        result.data_type.value,
                        result.enriched_at,
                        result.normalized_row_count,
                        result.enriched_row_count,
                        result.skipped_row_count,
                        Jsonb(dump_models(result.preview_rows)),
                        Jsonb(dump_models(result.rows)),
                    ),
                )

        return result.model_copy(deep=True)

    def get_moving_average_result(
        self,
        upload_id: UUID,
        result_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> GprMovingAverageResultSet | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        id,
                        upload_id,
                        created_at,
                        field_key,
                        interface_number,
                        field_label,
                        window_distance,
                        channel_number,
                        source_enriched_row_count,
                        point_count,
                        preview_points,
                        points
                    FROM gpr_moving_average_results
                    WHERE upload_id = %s
                      AND id = %s
                    """,
                    (upload_id, result_id),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        paged_points = []
        if limit > 0:
            with self._database.connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COALESCE(
                            (
                                SELECT jsonb_agg(item.value ORDER BY item.ordinality)
                                FROM jsonb_array_elements(gpr_moving_average_results.points)
                                    WITH ORDINALITY AS item(value, ordinality)
                                WHERE item.ordinality > %s
                                  AND item.ordinality <= %s
                            ),
                            '[]'::jsonb
                        ) AS points
                        FROM gpr_moving_average_results
                        WHERE upload_id = %s
                          AND id = %s
                        """,
                        (offset, offset + limit, upload_id, result_id),
                    )
                    points_result = cursor.fetchone()
            paged_points = load_gpr_moving_average_points(
                points_result["points"] if points_result else []
            )

        return GprMovingAverageResultSet.model_validate(
            {
                **row,
                "preview_points": [
                    item.model_dump(mode="json")
                    for item in load_gpr_moving_average_points(row["preview_points"])
                ],
                "points": [item.model_dump(mode="json") for item in paged_points],
                "points_offset": offset,
                "points_limit": limit,
                "returned_point_count": len(paged_points),
                "has_more_points": offset + len(paged_points) < row["point_count"],
            }
        )

    def save_moving_average_result(
        self,
        result: GprMovingAverageResultSet,
    ) -> GprMovingAverageResultSet:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO gpr_moving_average_results (
                        id,
                        upload_id,
                        created_at,
                        field_key,
                        interface_number,
                        field_label,
                        window_distance,
                        channel_number,
                        source_enriched_row_count,
                        point_count,
                        preview_points,
                        points
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        result.id,
                        result.upload_id,
                        result.created_at,
                        result.field_key,
                        result.interface_number,
                        result.field_label,
                        result.window_distance,
                        result.channel_number,
                        result.source_enriched_row_count,
                        result.point_count,
                        Jsonb(dump_models(result.preview_points)),
                        Jsonb(dump_models(result.points)),
                    ),
                )

        return result.model_copy(deep=True)
