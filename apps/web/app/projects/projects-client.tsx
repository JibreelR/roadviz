"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, useTransition } from "react";

import {
  createProject,
  getProjectStationMilepostTies,
  listProjects,
  saveProjectStationMilepostTies,
  type Project,
  type ProjectCreateInput,
  type ProjectStationMilepostTieTable,
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

type ProjectTieRowForm = {
  station: string;
  milepost: string;
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

const defaultProjectTieRows: ProjectTieRowForm[] = [
  { station: "0+00", milepost: "0" },
  { station: "1+00", milepost: "0.02" },
];

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

function isMissingProjectTieTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "Project station/MP tie table not found."
  );
}

function buildProjectTieRowsFromTable(
  tieTable: ProjectStationMilepostTieTable,
): ProjectTieRowForm[] {
  return tieTable.rows.map((row) => ({
    station: row.station,
    milepost: String(row.milepost),
  }));
}

export default function ProjectsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectFormState>(initialFormState);
  const [selectedTieProjectId, setSelectedTieProjectId] = useState<string>("");
  const [projectTieRows, setProjectTieRows] = useState<ProjectTieRowForm[]>(
    defaultProjectTieRows,
  );
  const [projectTieTable, setProjectTieTable] =
    useState<ProjectStationMilepostTieTable | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProjectTies, setIsLoadingProjectTies] = useState(false);
  const [isSavingProjectTies, setIsSavingProjectTies] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [projectTieError, setProjectTieError] = useState<string | null>(null);
  const [projectTieMessage, setProjectTieMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      try {
        setErrorMessage(null);
        const loadedProjects = await listProjects(controller.signal);
        setProjects(loadedProjects);
        setSelectedTieProjectId((current) => current || loadedProjects[0]?.id || "");
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

  useEffect(() => {
    if (!selectedTieProjectId) {
      setProjectTieTable(null);
      setProjectTieRows(defaultProjectTieRows);
      return;
    }

    const controller = new AbortController();

    async function loadProjectTies() {
      try {
        setIsLoadingProjectTies(true);
        setProjectTieError(null);
        const loadedTieTable = await getProjectStationMilepostTies(
          selectedTieProjectId,
          controller.signal,
        );
        setProjectTieTable(loadedTieTable);
        setProjectTieRows(buildProjectTieRowsFromTable(loadedTieTable));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (isMissingProjectTieTableError(error)) {
          setProjectTieTable(null);
          setProjectTieRows(defaultProjectTieRows);
          return;
        }
        setProjectTieError(
          error instanceof Error
            ? error.message
            : "Project station/MP ties could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingProjectTies(false);
        }
      }
    }

    void loadProjectTies();

    return () => controller.abort();
  }, [selectedTieProjectId]);

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
          setSelectedTieProjectId((current) => current || createdProject.id);
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

  function handleProjectTieRowChange(
    index: number,
    updates: Partial<ProjectTieRowForm>,
  ) {
    setProjectTieRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...updates } : row,
      ),
    );
    setProjectTieError(null);
    setProjectTieMessage(null);
  }

  function handleAddProjectTieRow() {
    setProjectTieRows((current) => [...current, { station: "", milepost: "" }]);
    setProjectTieError(null);
    setProjectTieMessage(null);
  }

  function handleRemoveProjectTieRow(index: number) {
    setProjectTieRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setProjectTieError(null);
    setProjectTieMessage(null);
  }

  function buildProjectTiePayload() {
    const rows = projectTieRows.map((row) => {
      const station = row.station.trim();
      const milepost = Number.parseFloat(row.milepost);
      if (!station) {
        throw new Error("Each project tie row needs a station value.");
      }
      if (!Number.isFinite(milepost)) {
        throw new Error("Project tie milepost values must be numeric.");
      }
      return { station, milepost };
    });

    if (rows.length < 2) {
      throw new Error("Enter at least two project station/MP tie rows.");
    }

    return rows;
  }

  async function handleSaveProjectTies() {
    if (!selectedTieProjectId) {
      setProjectTieError("Create or select a project before saving station/MP ties.");
      return;
    }

    try {
      setIsSavingProjectTies(true);
      setProjectTieError(null);
      const savedTieTable = await saveProjectStationMilepostTies({
        projectId: selectedTieProjectId,
        rows: buildProjectTiePayload(),
      });
      setProjectTieTable(savedTieTable);
      setProjectTieRows(buildProjectTieRowsFromTable(savedTieTable));
      setProjectTieMessage("Project station/MP ties saved for reuse by uploads.");
    } catch (error) {
      setProjectTieError(
        error instanceof Error
          ? error.message
          : "Project station/MP ties could not be saved.",
      );
    } finally {
      setIsSavingProjectTies(false);
    }
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
            <p className="eyebrow">Project Station/MP Ties</p>
            <h2>Define station to milepost once per project.</h2>
          </div>
          <p className="section-copy">
            These project ties are reused during enrichment. Upload-specific GPR ties
            only map collection distance to project station.
          </p>
        </div>

        {projects.length === 0 ? (
          <p className="empty-state">
            Create a project before entering station to milepost ties.
          </p>
        ) : (
          <div className="stack-sm">
            <div className="form-grid">
              <label className="field-full">
                <span>Project</span>
                <select
                  value={selectedTieProjectId}
                  onChange={(event) => {
                    setSelectedTieProjectId(event.target.value);
                    setProjectTieMessage(null);
                    setProjectTieError(null);
                  }}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_code} | {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isLoadingProjectTies ? (
              <p className="empty-state">Loading project station/MP ties...</p>
            ) : (
              <>
                <div className="table-shell">
                  <table className="projects-table tie-table">
                    <thead>
                      <tr>
                        <th>Station</th>
                        <th>Milepost</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectTieRows.map((row, index) => (
                        <tr key={`project-tie-row-${index}`}>
                          <td>
                            <input
                              value={row.station}
                              onChange={(event) =>
                                handleProjectTieRowChange(index, {
                                  station: event.target.value,
                                })
                              }
                              placeholder="100+00"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={row.milepost}
                              onChange={(event) =>
                                handleProjectTieRowChange(index, {
                                  milepost: event.target.value,
                                })
                              }
                              placeholder="10.0"
                            />
                          </td>
                          <td>
                            <button
                              className="button-secondary button-inline"
                              type="button"
                              onClick={() => handleRemoveProjectTieRow(index)}
                              disabled={projectTieRows.length <= 2}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="form-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={handleAddProjectTieRow}
                  >
                    Add tie row
                  </button>
                  <button
                    className="button-primary"
                    type="button"
                    onClick={handleSaveProjectTies}
                    disabled={isSavingProjectTies}
                  >
                    {isSavingProjectTies ? "Saving ties..." : "Save project ties"}
                  </button>
                  <p className="inline-note">
                    {projectTieTable === null
                      ? "No station/MP tie table has been saved for this project."
                      : `Last saved ${formatTimestamp(projectTieTable.updated_at)}`}
                  </p>
                </div>
              </>
            )}

            {projectTieError ? (
              <p className="message error">{projectTieError}</p>
            ) : null}
            {projectTieMessage ? (
              <p className="message success">{projectTieMessage}</p>
            ) : null}
          </div>
        )}
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
                  <th>Uploads</th>
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
                    <td>
                      <Link
                        className="button-secondary button-inline"
                        href={`/projects/${project.id}/uploads`}
                      >
                        Open uploads
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
