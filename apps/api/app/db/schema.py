from __future__ import annotations

from uuid import uuid4

from psycopg.types.json import Jsonb

from app.db.connection import Database
from app.projects.schemas import utc_now
from app.schema_templates.schemas import default_template_seeds


class DatabaseSchemaManager:
    """Create the MVP tables and seed baseline template data."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def initialize(self) -> None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS projects (
                        id UUID PRIMARY KEY,
                        project_code VARCHAR(50) NOT NULL,
                        name VARCHAR(200) NOT NULL,
                        client_name VARCHAR(200),
                        route VARCHAR(100),
                        roadway VARCHAR(200),
                        direction VARCHAR(50),
                        county VARCHAR(100),
                        state VARCHAR(50),
                        start_mp DOUBLE PRECISION,
                        end_mp DOUBLE PRECISION,
                        start_station VARCHAR(100),
                        end_station VARCHAR(100),
                        description TEXT,
                        status VARCHAR(20) NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS uploads (
                        id UUID PRIMARY KEY,
                        project_id UUID NOT NULL REFERENCES projects (id),
                        filename VARCHAR(255) NOT NULL,
                        data_type VARCHAR(20) NOT NULL,
                        file_format VARCHAR(20) NOT NULL,
                        status VARCHAR(20) NOT NULL,
                        notes TEXT,
                        uploaded_at TIMESTAMPTZ NOT NULL,
                        storage_path TEXT NOT NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS gpr_upload_configs (
                        upload_id UUID PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
                        file_identifier VARCHAR(120) NOT NULL,
                        channel_count INTEGER NOT NULL,
                        channel_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
                        interface_count INTEGER NOT NULL,
                        interface_labels JSONB NOT NULL DEFAULT '{}'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_templates (
                        id UUID PRIMARY KEY,
                        name VARCHAR(200) NOT NULL,
                        data_type VARCHAR(20) NOT NULL,
                        is_default BOOLEAN NOT NULL DEFAULT FALSE,
                        field_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL,
                        CONSTRAINT schema_templates_data_type_name_key UNIQUE (data_type, name)
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS upload_mappings (
                        upload_id UUID PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
                        project_id UUID NOT NULL REFERENCES projects (id),
                        data_type VARCHAR(20) NOT NULL,
                        assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS normalized_uploads (
                        upload_id UUID PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
                        data_type VARCHAR(20) NOT NULL,
                        normalized_at TIMESTAMPTZ NOT NULL,
                        total_source_row_count INTEGER NOT NULL,
                        normalized_row_count INTEGER NOT NULL,
                        preview_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
                        rows JSONB NOT NULL DEFAULT '[]'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS linear_reference_tie_tables (
                        upload_id UUID PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
                        project_id UUID NOT NULL REFERENCES projects (id),
                        updated_at TIMESTAMPTZ NOT NULL,
                        rows JSONB NOT NULL DEFAULT '[]'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS project_station_milepost_tie_tables (
                        project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
                        updated_at TIMESTAMPTZ NOT NULL,
                        rows JSONB NOT NULL DEFAULT '[]'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS upload_distance_station_tie_tables (
                        upload_id UUID PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
                        project_id UUID NOT NULL REFERENCES projects (id),
                        updated_at TIMESTAMPTZ NOT NULL,
                        rows JSONB NOT NULL DEFAULT '[]'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS enriched_uploads (
                        upload_id UUID PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
                        data_type VARCHAR(20) NOT NULL,
                        enriched_at TIMESTAMPTZ NOT NULL,
                        normalized_row_count INTEGER NOT NULL,
                        enriched_row_count INTEGER NOT NULL,
                        skipped_row_count INTEGER NOT NULL,
                        preview_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
                        rows JSONB NOT NULL DEFAULT '[]'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS gpr_moving_average_results (
                        id UUID PRIMARY KEY,
                        upload_id UUID NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
                        created_at TIMESTAMPTZ NOT NULL,
                        field_key VARCHAR(100) NOT NULL,
                        interface_number INTEGER NOT NULL,
                        field_label VARCHAR(200) NOT NULL,
                        window_distance DOUBLE PRECISION NOT NULL,
                        channel_number INTEGER,
                        source_enriched_row_count INTEGER NOT NULL,
                        point_count INTEGER NOT NULL,
                        preview_points JSONB NOT NULL DEFAULT '[]'::jsonb,
                        points JSONB NOT NULL DEFAULT '[]'::jsonb
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS uploads_project_id_idx
                    ON uploads (project_id)
                    """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS schema_templates_data_type_idx
                    ON schema_templates (data_type)
                    """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS linear_reference_tie_tables_project_id_idx
                    ON linear_reference_tie_tables (project_id)
                    """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS upload_distance_station_tie_tables_project_id_idx
                    ON upload_distance_station_tie_tables (project_id)
                    """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS gpr_moving_average_results_upload_id_idx
                    ON gpr_moving_average_results (upload_id)
                    """
                )

            self._migrate_legacy_linear_reference_ties(connection)
            self._seed_default_schema_templates(connection)

    def reset_for_tests(self) -> None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    TRUNCATE TABLE
                        gpr_moving_average_results,
                        enriched_uploads,
                        upload_distance_station_tie_tables,
                        project_station_milepost_tie_tables,
                        linear_reference_tie_tables,
                        normalized_uploads,
                        upload_mappings,
                        gpr_upload_configs,
                        uploads,
                        schema_templates,
                        projects
                    RESTART IDENTITY CASCADE
                    """
                )
            self._seed_default_schema_templates(connection)

    def _migrate_legacy_linear_reference_ties(self, connection) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO upload_distance_station_tie_tables (
                    upload_id,
                    project_id,
                    updated_at,
                    rows
                )
                SELECT
                    upload_id,
                    project_id,
                    updated_at,
                    rows
                FROM linear_reference_tie_tables
                ON CONFLICT (upload_id) DO NOTHING
                """
            )
            cursor.execute(
                """
                WITH legacy_project_ties AS (
                    SELECT DISTINCT ON (project_id)
                        project_id,
                        updated_at,
                        rows
                    FROM linear_reference_tie_tables
                    ORDER BY project_id, updated_at DESC
                )
                INSERT INTO project_station_milepost_tie_tables (
                    project_id,
                    updated_at,
                    rows
                )
                SELECT
                    project_id,
                    updated_at,
                    (
                        SELECT COALESCE(
                            jsonb_agg(item.value - 'distance' ORDER BY item.ordinality),
                            '[]'::jsonb
                        )
                        FROM jsonb_array_elements(legacy_project_ties.rows)
                            WITH ORDINALITY AS item(value, ordinality)
                    ) AS rows
                FROM legacy_project_ties
                ON CONFLICT (project_id) DO NOTHING
                """
            )

    def _seed_default_schema_templates(self, connection) -> None:
        timestamp = utc_now()
        with connection.cursor() as cursor:
            for seed in default_template_seeds():
                cursor.execute(
                    """
                    INSERT INTO schema_templates (
                        id,
                        name,
                        data_type,
                        is_default,
                        field_mappings,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (data_type, name) DO NOTHING
                    """,
                    (
                        uuid4(),
                        seed.name,
                        seed.data_type.value,
                        seed.is_default,
                        Jsonb(seed.field_mappings),
                        timestamp,
                        timestamp,
                    ),
                )
