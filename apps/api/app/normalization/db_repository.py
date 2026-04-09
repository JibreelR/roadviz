from __future__ import annotations

from uuid import UUID

from psycopg.types.json import Jsonb

from app.db.connection import Database
from app.db.serialization import dump_models, load_normalized_rows
from app.normalization.schemas import NormalizedResultSet


class DatabaseNormalizedUploadRepository:
    """Persist normalization summaries and result rows in PostgreSQL."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def get(
        self,
        upload_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> NormalizedResultSet | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        upload_id,
                        data_type,
                        normalized_at,
                        total_source_row_count,
                        normalized_row_count,
                        preview_rows,
                        rows
                    FROM normalized_uploads
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
                                FROM jsonb_array_elements(normalized_uploads.rows)
                                    WITH ORDINALITY AS item(value, ordinality)
                                WHERE item.ordinality > %s
                                  AND item.ordinality <= %s
                            ),
                            '[]'::jsonb
                        ) AS rows
                        FROM normalized_uploads
                        WHERE upload_id = %s
                        """,
                        (
                            offset,
                            offset + limit,
                            upload_id,
                        ),
                    )
                    rows_result = cursor.fetchone()
            paged_rows = load_normalized_rows(rows_result["rows"] if rows_result else [])

        return NormalizedResultSet.model_validate(
            {
                **row,
                "preview_rows": [
                    item.model_dump(mode="json")
                    for item in load_normalized_rows(row["preview_rows"])
                ],
                "rows": [item.model_dump(mode="json") for item in paged_rows],
                "rows_offset": offset,
                "rows_limit": limit,
                "returned_row_count": len(paged_rows),
                "has_more_rows": offset + len(paged_rows) < row["normalized_row_count"],
            }
        )

    def save(self, result: NormalizedResultSet) -> NormalizedResultSet:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO normalized_uploads (
                        upload_id,
                        data_type,
                        normalized_at,
                        total_source_row_count,
                        normalized_row_count,
                        preview_rows,
                        rows
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (upload_id)
                    DO UPDATE SET
                        data_type = EXCLUDED.data_type,
                        normalized_at = EXCLUDED.normalized_at,
                        total_source_row_count = EXCLUDED.total_source_row_count,
                        normalized_row_count = EXCLUDED.normalized_row_count,
                        preview_rows = EXCLUDED.preview_rows,
                        rows = EXCLUDED.rows
                    """,
                    (
                        result.upload_id,
                        result.data_type.value,
                        result.normalized_at,
                        result.total_source_row_count,
                        result.normalized_row_count,
                        Jsonb(dump_models(result.preview_rows)),
                        Jsonb(dump_models(result.rows)),
                    ),
                )

        return result.model_copy(deep=True)
