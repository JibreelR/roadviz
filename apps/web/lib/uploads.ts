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
