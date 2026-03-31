"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";

import {
  createProject,
  listProjects,
  type Project,
  type ProjectCreateInput,
  type ProjectStatus,
} from "../../lib/projects";

type ProjectFormState = {
  project_code: string;
  name: string;
  client_name: string;
  route: string;
  roadway: string;
  direction: string;
  county: string;
  state: string;
  start_mp: string;
  end_mp: string;
  start_station: string;
  end_station: string;
  description: string;
  status: ProjectStatus;
};

const initialFormState: ProjectFormState = {
  project_code: "",
  name: "",
  client_name: "",
  route: "",
  roadway: "",
  direction: "",
  county: "",
  state: "NJ",
  start_mp: "",
  end_mp: "",
  start_station: "",
  end_station: "",
  description: "",
  status: "draft",
};

const statusOptions: ProjectStatus[] = ["draft", "active", "completed", "archived"];

function toOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toOptionalNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error("Start and end milepost values must be numbers.");
  }

  return parsed;
}

function toProjectPayload(form: ProjectFormState): ProjectCreateInput {
  return {
    project_code: form.project_code.trim(),
    name: form.name.trim(),
    client_name: toOptionalText(form.client_name),
    route: toOptionalText(form.route),
    roadway: toOptionalText(form.roadway),
    direction: toOptionalText(form.direction),
    county: toOptionalText(form.county),
    state: toOptionalText(form.state),
    start_mp: toOptionalNumber(form.start_mp),
    end_mp: toOptionalNumber(form.end_mp),
    start_station: toOptionalText(form.start_station),
    end_station: toOptionalText(form.end_station),
    description: toOptionalText(form.description),
    status: form.status,
  };
}

function formatLimits(project: Project): string {
  const mileposts =
    project.start_mp !== null || project.end_mp !== null
      ? `MP ${project.start_mp ?? "-"} to ${project.end_mp ?? "-"}`
      : null;
  const stations =
    project.start_station || project.end_station
      ? `Sta ${project.start_station ?? "-"} to ${project.end_station ?? "-"}`
      : null;

  return [mileposts, stations].filter(Boolean).join(" | ") || "Not set";
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function ProjectsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      try {
        setErrorMessage(null);
        const loadedProjects = await listProjects(controller.signal);
        setProjects(loadedProjects);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setErrorMessage(
          error instanceof Error ? error.message : "Projects could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProjects();

    return () => controller.abort();
  }, []);

  function updateField<K extends keyof ProjectFormState>(
    field: K,
    value: ProjectFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const payload = toProjectPayload(form);
          const createdProject = await createProject(payload);
          setProjects((current) => [createdProject, ...current]);
          setForm(initialFormState);
          setErrorMessage(null);
          setSuccessMessage(`Created project ${createdProject.project_code}.`);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Project could not be created.",
          );
        }
      })();
    });
  }

  return (
    <div className="stack-lg">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Create Project</p>
            <h2>Start tracking a roadway evaluation job.</h2>
          </div>
          <p className="section-copy">
            Capture the basic corridor, client, and limits metadata now and plug in real
            data workflows later.
          </p>
        </div>

        <form className="project-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              <span>Project code</span>
              <input
                required
                value={form.project_code}
                onChange={(event) => updateField("project_code", event.target.value)}
                placeholder="NJDOT-001"
              />
            </label>

            <label>
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="I-80 Corridor Survey"
              />
            </label>

            <label>
              <span>Client name</span>
              <input
                value={form.client_name}
                onChange={(event) => updateField("client_name", event.target.value)}
                placeholder="NJDOT"
              />
            </label>

            <label>
              <span>Route</span>
              <input
                value={form.route}
                onChange={(event) => updateField("route", event.target.value)}
                placeholder="I-80"
              />
            </label>

            <label>
              <span>Roadway</span>
              <input
                value={form.roadway}
                onChange={(event) => updateField("roadway", event.target.value)}
                placeholder="Mainline"
              />
            </label>

            <label>
              <span>Direction</span>
              <input
                value={form.direction}
                onChange={(event) => updateField("direction", event.target.value)}
                placeholder="EB"
              />
            </label>

            <label>
              <span>County</span>
              <input
                value={form.county}
                onChange={(event) => updateField("county", event.target.value)}
                placeholder="Morris"
              />
            </label>

            <label>
              <span>State</span>
              <input
                value={form.state}
                onChange={(event) => updateField("state", event.target.value)}
                placeholder="NJ"
              />
            </label>

            <label>
              <span>Start MP</span>
              <input
                value={form.start_mp}
                onChange={(event) => updateField("start_mp", event.target.value)}
                placeholder="12.3"
              />
            </label>

            <label>
              <span>End MP</span>
              <input
                value={form.end_mp}
                onChange={(event) => updateField("end_mp", event.target.value)}
                placeholder="18.7"
              />
            </label>

            <label>
              <span>Start station</span>
              <input
                value={form.start_station}
                onChange={(event) => updateField("start_station", event.target.value)}
                placeholder="123+00"
              />
            </label>

            <label>
              <span>End station</span>
              <input
                value={form.end_station}
                onChange={(event) => updateField("end_station", event.target.value)}
                placeholder="187+00"
              />
            </label>

            <label>
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  updateField("status", event.target.value as ProjectStatus)
                }
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-full">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Initial project notes and scope."
                rows={4}
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="button-primary" type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Create project"}
            </button>
            <p className="inline-note">
              Required now: project code and name. Everything else can be filled in as the
              project definition matures.
            </p>
          </div>
        </form>

        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
        {successMessage ? <p className="message success">{successMessage}</p> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project List</p>
            <h2>Current projects</h2>
          </div>
          <p className="section-copy">
            A simple operational view for the first RoadViz product object.
          </p>
        </div>

        {isLoading ? (
          <p className="empty-state">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="empty-state">
            No projects yet. Create one above to start the RoadViz workflow.
          </p>
        ) : (
          <div className="table-shell">
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Route</th>
                  <th>Limits</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className="table-primary">{project.name}</div>
                      <div className="table-secondary">{project.project_code}</div>
                    </td>
                    <td>{project.client_name ?? "Not set"}</td>
                    <td>
                      {[project.route, project.roadway, project.direction]
                        .filter(Boolean)
                        .join(" / ") || "Not set"}
                    </td>
                    <td>{formatLimits(project)}</td>
                    <td>
                      <span className={`status-pill status-${project.status}`}>
                        {project.status}
                      </span>
                    </td>
                    <td>{formatTimestamp(project.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
