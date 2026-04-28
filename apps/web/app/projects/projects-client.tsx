"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, useTransition } from "react";

import {
  createProject,
  listProjects,
  type LinearReferenceMode,
  type Project,
  type ProjectCreateInput,
  type ProjectStatus,
} from "../../lib/projects";

type ProjectFormState = {
  project_code: string;
  name: string;
  lane_count: string;
  has_outside_shoulder: boolean;
  has_inside_shoulder: boolean;
  ramp_count: string;
  linear_reference_mode: LinearReferenceMode;
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
  lane_count: "1",
  has_outside_shoulder: true,
  has_inside_shoulder: false,
  ramp_count: "0",
  linear_reference_mode: "stations_mileposts",
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

function toRequiredCount(value: string, label: string, minimum: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${label} must be at least ${minimum}.`);
  }
  return parsed;
}

function toProjectPayload(form: ProjectFormState): ProjectCreateInput {
  return {
    project_code: form.project_code.trim(),
    name: form.name.trim(),
    lane_count: toRequiredCount(form.lane_count, "Lane count", 1),
    has_outside_shoulder: form.has_outside_shoulder,
    has_inside_shoulder: form.has_inside_shoulder,
    ramp_count: toRequiredCount(form.ramp_count, "Ramp count", 0),
    linear_reference_mode: form.linear_reference_mode,
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

function describeElements(project: Project): string {
  const parts = [`${project.lane_count} lane${project.lane_count === 1 ? "" : "s"}`];
  if (project.has_outside_shoulder) {
    parts.push("Outside shoulder");
  }
  if (project.has_inside_shoulder) {
    parts.push("Inside shoulder");
  }
  if (project.ramp_count > 0) {
    parts.push(`${project.ramp_count} ramp${project.ramp_count === 1 ? "" : "s"}`);
  }
  return parts.join(" | ");
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
            <h2>Set up the corridor and roadway elements.</h2>
          </div>
          <p className="section-copy">
            Capture the project once, generate the roadway elements automatically, and
            then move into the project workspace for GPR, coring, DCP, and FWD work.
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
              <span>Lane count</span>
              <input
                type="number"
                min={1}
                max={24}
                value={form.lane_count}
                onChange={(event) => updateField("lane_count", event.target.value)}
              />
            </label>

            <label>
              <span>Ramp count</span>
              <input
                type="number"
                min={0}
                max={24}
                value={form.ramp_count}
                onChange={(event) => updateField("ramp_count", event.target.value)}
              />
            </label>

            <label>
              <span>Outside shoulder</span>
              <select
                value={form.has_outside_shoulder ? "yes" : "no"}
                onChange={(event) =>
                  updateField("has_outside_shoulder", event.target.value === "yes")
                }
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <label>
              <span>Inside shoulder</span>
              <select
                value={form.has_inside_shoulder ? "yes" : "no"}
                onChange={(event) =>
                  updateField("has_inside_shoulder", event.target.value === "yes")
                }
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <label>
              <span>Linear referencing</span>
              <select
                value={form.linear_reference_mode}
                onChange={(event) =>
                  updateField(
                    "linear_reference_mode",
                    event.target.value as LinearReferenceMode,
                  )
                }
              >
                <option value="stations_only">Stations only</option>
                <option value="stations_mileposts">Stations + Mileposts</option>
              </select>
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

            {form.linear_reference_mode === "stations_mileposts" ? (
              <>
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
              </>
            ) : null}

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
              At least one lane is required. RoadViz will generate lanes, optional
              shoulders, and ramps automatically for the workspace.
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
            <h2>Open a project workspace</h2>
          </div>
          <p className="section-copy">
            Use the workspace as the operational surface and keep the deeper upload and
            mapping details tucked behind it.
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
                  <th>Elements</th>
                  <th>Route</th>
                  <th>Limits</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Workspace</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className="table-primary">{project.name}</div>
                      <div className="table-secondary">{project.project_code}</div>
                    </td>
                    <td>{describeElements(project)}</td>
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
                    <td>
                      <Link
                        className="button-primary button-inline"
                        href={`/projects/${project.id}`}
                      >
                        Open workspace
                      </Link>
                    </td>
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
