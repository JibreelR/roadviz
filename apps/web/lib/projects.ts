export type ProjectStatus = "draft" | "active" | "completed" | "archived";

export type Project = {
  id: string;
  project_code: string;
  name: string;
  client_name: string | null;
  route: string | null;
  roadway: string | null;
  direction: string | null;
  county: string | null;
  state: string | null;
  start_mp: number | null;
  end_mp: number | null;
  start_station: string | null;
  end_station: string | null;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type ProjectCreateInput = {
  project_code: string;
  name: string;
  client_name: string | null;
  route: string | null;
  roadway: string | null;
  direction: string | null;
  county: string | null;
  state: string | null;
  start_mp: number | null;
  end_mp: number | null;
  start_station: string | null;
  end_station: string | null;
  description: string | null;
  status: ProjectStatus;
};

const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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

export async function listProjects(signal?: AbortSignal): Promise<Project[]> {
  return requestJson<Project[]>("/projects", { method: "GET", signal });
}

export async function createProject(project: ProjectCreateInput): Promise<Project> {
  return requestJson<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(project),
  });
}
