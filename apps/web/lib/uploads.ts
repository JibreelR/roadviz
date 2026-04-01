export type DataType = "gpr" | "core" | "fwd" | "dcp";

export type FileFormat = "csv" | "xlsx" | "unknown";

export type UploadStatus = "received" | "mapping_pending" | "processing" | "failed";

export type UploadRecord = {
  id: string;
  project_id: string;
  filename: string;
  data_type: DataType;
  file_format: FileFormat;
  uploaded_at: string;
  status: UploadStatus;
  notes: string | null;
};

export type SchemaTemplate = {
  id: string;
  name: string;
  data_type: DataType;
  is_default: boolean;
  field_mappings: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type PreviewStatus = "stubbed" | "parsed";

export type SourceColumnPreview = {
  name: string;
  sample_values: Array<string | null>;
  inferred_type: string | null;
};

export type UploadPreview = {
  upload: UploadRecord;
  preview_status: PreviewStatus;
  source_columns: SourceColumnPreview[];
  sample_rows: Array<Record<string, string | null>>;
  row_count_estimate: number | null;
};

export type CanonicalFieldCategory =
  | "identifier"
  | "location"
  | "measurement"
  | "context";

export type CanonicalFieldDefinition = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  allow_multiple: boolean;
  category: CanonicalFieldCategory;
  example_source_headers: string[];
};

export type MappingDefinition = {
  data_type: DataType;
  supported_file_formats: FileFormat[];
  canonical_fields: CanonicalFieldDefinition[];
};

export type ColumnMappingAssignment = {
  source_column: string;
  canonical_field: string | null;
};

export type UploadMappingState = {
  upload_id: string;
  project_id: string;
  data_type: DataType;
  assignments: ColumnMappingAssignment[];
  updated_at: string | null;
  is_saved: boolean;
};

export type MappingValidationSeverity = "error" | "warning";

export type MappingValidationIssue = {
  code: string;
  severity: MappingValidationSeverity;
  message: string;
  source_column: string | null;
  canonical_field: string | null;
};

export type MappingValidationResult = {
  upload_id: string;
  data_type: DataType;
  is_valid: boolean;
  issues: MappingValidationIssue[];
  mapped_field_count: number;
  required_field_count: number;
  satisfied_required_field_count: number;
};

const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    const message = errorBody?.detail ?? "The request could not be completed.";
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function listProjectUploads(
  projectId: string,
  signal?: AbortSignal,
): Promise<UploadRecord[]> {
  return requestJson<UploadRecord[]>(`/projects/${projectId}/uploads`, {
    method: "GET",
    signal,
  });
}

export async function createProjectUpload(input: {
  projectId: string;
  dataType: DataType;
  notes: string;
  file: File;
}): Promise<UploadRecord> {
  const formData = new FormData();
  formData.append("data_type", input.dataType);
  formData.append("notes", input.notes);
  formData.append("file", input.file);

  return requestJson<UploadRecord>(`/projects/${input.projectId}/uploads`, {
    method: "POST",
    body: formData,
  });
}

export async function listSchemaTemplates(
  dataType?: DataType,
  signal?: AbortSignal,
): Promise<SchemaTemplate[]> {
  const search = dataType ? `?data_type=${encodeURIComponent(dataType)}` : "";
  return requestJson<SchemaTemplate[]>(`/schema-templates${search}`, {
    method: "GET",
    signal,
  });
}

export async function getUploadPreview(
  uploadId: string,
  signal?: AbortSignal,
): Promise<UploadPreview> {
  return requestJson<UploadPreview>(`/uploads/${uploadId}/preview`, {
    method: "GET",
    signal,
  });
}

export async function getMappingDefinitions(
  dataType: DataType,
  signal?: AbortSignal,
): Promise<MappingDefinition> {
  return requestJson<MappingDefinition>(
    `/mapping-definitions?data_type=${encodeURIComponent(dataType)}`,
    {
      method: "GET",
      signal,
    },
  );
}

export async function getUploadMapping(
  uploadId: string,
  signal?: AbortSignal,
): Promise<UploadMappingState> {
  return requestJson<UploadMappingState>(`/uploads/${uploadId}/mapping`, {
    method: "GET",
    signal,
  });
}

export async function saveUploadMapping(input: {
  uploadId: string;
  assignments: ColumnMappingAssignment[];
}): Promise<UploadMappingState> {
  return requestJson<UploadMappingState>(`/uploads/${input.uploadId}/mapping`, {
    method: "POST",
    body: JSON.stringify({ assignments: input.assignments }),
  });
}

export async function validateUploadMapping(input: {
  uploadId: string;
  assignments: ColumnMappingAssignment[];
}): Promise<MappingValidationResult> {
  return requestJson<MappingValidationResult>(
    `/uploads/${input.uploadId}/validate-mapping`,
    {
      method: "POST",
      body: JSON.stringify({ assignments: input.assignments }),
    },
  );
}
