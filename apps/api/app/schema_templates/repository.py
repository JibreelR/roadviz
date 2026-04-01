from __future__ import annotations

from threading import Lock
from typing import Protocol
from uuid import UUID, uuid4

from app.projects.schemas import utc_now
from app.schema_templates.schemas import (
    SchemaTemplate,
    SchemaTemplateWrite,
    default_template_seeds,
)
from app.uploads.schemas import DataType


class SchemaTemplateRepository(Protocol):
    def create(self, template_in: SchemaTemplateWrite) -> SchemaTemplate: ...

    def list(self, data_type: DataType | None = None) -> list[SchemaTemplate]: ...


class InMemorySchemaTemplateRepository:
    """Store schema templates in memory until persistence is introduced."""

    def __init__(self) -> None:
        self._templates: dict[UUID, SchemaTemplate] = {}
        self._lock = Lock()
        self._seed_defaults()

    def _seed_defaults(self) -> None:
        timestamp = utc_now()
        for seed in default_template_seeds():
            template = SchemaTemplate(
                id=uuid4(),
                name=seed.name,
                data_type=seed.data_type,
                is_default=seed.is_default,
                field_mappings=seed.field_mappings,
                created_at=timestamp,
                updated_at=timestamp,
            )
            self._templates[template.id] = template

    def create(self, template_in: SchemaTemplateWrite) -> SchemaTemplate:
        timestamp = utc_now()
        template = SchemaTemplate(
            id=uuid4(),
            created_at=timestamp,
            updated_at=timestamp,
            **template_in.model_dump(),
        )

        with self._lock:
            self._templates[template.id] = template

        return template.model_copy(deep=True)

    def list(self, data_type: DataType | None = None) -> list[SchemaTemplate]:
        with self._lock:
            templates = [template.model_copy(deep=True) for template in self._templates.values()]

        if data_type is not None:
            templates = [template for template in templates if template.data_type == data_type]

        return sorted(
            templates,
            key=lambda template: (
                template.data_type,
                not template.is_default,
                template.name.lower(),
            ),
        )
