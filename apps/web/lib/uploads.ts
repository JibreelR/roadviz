export type DataType = "gpr" | "core" | "fwd" | "dcp";

export type FileFormat = "csv" | "xlsx" | "unknown";

export type UploadStatus = "received" | "mapping_pending" | "processing" | "failed";

export type GprImportConfig = {
  file_identifier: string;
  channel_count: number;
  channel_labels: Record<string, string>;
  interface_count: number;
  interface_labels: Record<string, string>;
};

export type UploadRecord = {
  id: string;
  project_id: string;
  filename: string;
  data_type: DataType;
  file_format: FileFormat;
  uploaded_at: string;
  status: UploadStatus;
  notes: string | null;
  gpr_import_config: GprImportConfig | null;
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
  row_count: number | null;
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

export type GprNormalizedValues = {
  file_identifier: string;
  scan: number | null;
  distance: number | null;
  channel_number: number;
  channel_label: string;
  latitude: number | null;
  longitude: number | null;
  interface_depths: GprNormalizedInterfaceDepth[];
};

export type GprNormalizedInterfaceDepth = {
  interface_number: number;
  interface_label: string;
  depth: number | null;
};

export type CoreNormalizedValues = {
  core_id: string;
  station: string;
  lane: string | null;
  total_thickness_in: number;
  surface_type: string | null;
};

export type FwdNormalizedValues = {
  test_id: string;
  station: string;
  drop_load_lb: number;
  d0_mils: number;
  surface_temp_f: number | null;
};

export type DcpNormalizedValues = {
  test_point_id: string;
  station: string;
  blow_count: number;
  depth_mm: number;
  layer_note: string | null;
};

type NormalizedRowBase = {
  upload_id: string;
  row_index: number;
  source_row: Record<string, string | null>;
  mapped_values: Record<string, string | null>;
};

export type GprNormalizedRow = NormalizedRowBase & {
  data_type: "gpr";
  normalized_values: GprNormalizedValues;
};

export type CoreNormalizedRow = NormalizedRowBase & {
  data_type: "core";
  normalized_values: CoreNormalizedValues;
};

export type FwdNormalizedRow = NormalizedRowBase & {
  data_type: "fwd";
  normalized_values: FwdNormalizedValues;
};

export type DcpNormalizedRow = NormalizedRowBase & {
  data_type: "dcp";
  normalized_values: DcpNormalizedValues;
};

export type NormalizedUploadRow =
  | GprNormalizedRow
  | CoreNormalizedRow
  | FwdNormalizedRow
  | DcpNormalizedRow;

export type NormalizationRunSummary = {
  upload_id: string;
  data_type: DataType;
  normalized_at: string;
  total_source_row_count: number;
  normalized_row_count: number;
  preview_rows: NormalizedUploadRow[];
};

export type NormalizedResultSet = NormalizationRunSummary & {
  rows: NormalizedUploadRow[];
  rows_offset: number;
  rows_limit: number;
  returned_row_count: number;
  has_more_rows: boolean;
  issue_summary: {
    error_count: number;
    warning_count: number;
    errors: MappingValidationIssue[];
    warnings: MappingValidationIssue[];
  } | null;
};

const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasJsonBody = typeof init?.body === "string";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
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
  gprImportConfig?: {
    fileIdentifier: string;
    channelCount: number;
    channelLabels: Record<number, string>;
    interfaceCount: number;
    interfaceLabels: Record<number, string>;
  } | null;
}): Promise<UploadRecord> {
  const formData = new FormData();
  formData.append("data_type", input.dataType);
  formData.append("notes", input.notes);
  formData.append("file", input.file);
  if (input.gprImportConfig) {
    formData.append("gpr_file_identifier", input.gprImportConfig.fileIdentifier);
    formData.append("gpr_channel_count", String(input.gprImportConfig.channelCount));
    formData.append(
      "gpr_channel_labels_json",
      JSON.stringify(input.gprImportConfig.channelLabels),
    );
    formData.append("gpr_interface_count", String(input.gprImportConfig.interfaceCount));
    formData.append(
      "gpr_interface_labels_json",
      JSON.stringify(input.gprImportConfig.interfaceLabels),
    );
  }

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

export async function getUploadMappingDefinition(
  uploadId: string,
  signal?: AbortSignal,
): Promise<MappingDefinition> {
  return requestJson<MappingDefinition>(`/uploads/${uploadId}/mapping-definition`, {
    method: "GET",
    signal,
  });
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

export async function normalizeUpload(
  uploadId: string,
): Promise<NormalizationRunSummary> {
  return requestJson<NormalizationRunSummary>(`/uploads/${uploadId}/normalize`, {
    method: "POST",
  });
}

export async function getNormalizedUpload(
  uploadId: string,
  signal?: AbortSignal,
): Promise<NormalizedResultSet> {
  return requestJson<NormalizedResultSet>(`/uploads/${uploadId}/normalized`, {
    method: "GET",
    signal,
  });
}
