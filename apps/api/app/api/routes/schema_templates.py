from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_schema_template_repository
from app.schema_templates.repository import SchemaTemplateRepository
from app.schema_templates.schemas import SchemaTemplate, SchemaTemplateWrite
from app.uploads.schemas import DataType

router = APIRouter(tags=["schema-templates"])


@router.get("/schema-templates", response_model=list[SchemaTemplate])
def list_schema_templates(
    data_type: DataType | None = None,
    repository: SchemaTemplateRepository = Depends(get_schema_template_repository),
) -> list[SchemaTemplate]:
    return repository.list(data_type=data_type)


@router.post(
    "/schema-templates",
    response_model=SchemaTemplate,
    status_code=status.HTTP_201_CREATED,
)
def create_schema_template(
    template_in: SchemaTemplateWrite,
    repository: SchemaTemplateRepository = Depends(get_schema_template_repository),
) -> SchemaTemplate:
    return repository.create(template_in)
