"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import {
  createProjectUpload,
  listProjectUploads,
  listSchemaTemplates,
  type DataType,
  type SchemaTemplate,
  type UploadRecord,
} from "../../../../lib/uploads";
import { listProjects, type Project } from "../../../../lib/projects";

type UploadFormState = {
  dataType: DataType;
  notes: string;
  gpr: {
    fileIdentifier: string;
    channelCount: number;
    channelLabels: string[];
    interfaceCount: number;
    interfaceLabels: string[];
  };
};

const initialFormState: UploadFormState = {
  dataType: "gpr",
  notes: "",
  gpr: {
    fileIdentifier: "",
    channelCount: 1,
    channelLabels: [""],
    interfaceCount: 1,
    interfaceLabels: [""],
  },
};

const dataTypeOptions: Array<{ value: DataType; label: string }> = [
  { value: "gpr", label: "GPR" },
  { value: "core", label: "Core" },
  { value: "fwd", label: "FWD" },
  { value: "dcp", label: "DCP" },
];

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function clampCount(value: string, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, max);
}

function resizeLabels(labels: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => labels[index] ?? "");
}

function buildLabelMap(labels: string[]): Record<number, string> {
  const mappedLabels: Record<number, string> = {};
  labels.forEach((label, index) => {
    const normalized = label.trim();
    if (normalized) {
      mappedLabels[index + 1] = normalized;
    }
  });
  return mappedLabels;
}

export default function UploadsClient({
  initialProjectId,
}: {
  initialProjectId: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [form, setForm] = useState<UploadFormState>(initialFormState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [templates, setTemplates] = useState<SchemaTemplate[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjectsOnly() {
      try {
        setErrorMessage(null);
        const loadedProjects = await listProjects(controller.signal);
        setProjects(loadedProjects);

        if (loadedProjects.length === 0) {
          setSelectedProjectId("");
          setUploads([]);
          return;
        }

        const nextProjectId = loadedProjects.some(
          (project) => project.id === initialProjectId,
        )
          ? initialProjectId
          : loadedProjects[0].id;

        setSelectedProjectId(nextProjectId);
        if (nextProjectId !== initialProjectId) {
          router.replace(`/projects/${nextProjectId}/uploads`);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "The upload workspace could not be loaded.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsBootstrapping(false);
        }
      }
    }

    void loadProjectsOnly();

    return () => controller.abort();
  }, [initialProjectId, router]);

  useEffect(() => {
    if (!selectedProjectId) {
      setUploads([]);
      return;
    }

    const controller = new AbortController();

    async function loadUploads() {
      try {
        setErrorMessage(null);
        setIsLoadingUploads(true);
        const loadedUploads = await listProjectUploads(
          selectedProjectId,
          controller.signal,
        );
        setUploads(loadedUploads);
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Uploads could not be loaded.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingUploads(false);
        }
      }
    }

    void loadUploads();

    return () => controller.abort();
  }, [selectedProjectId]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTemplates() {
      try {
        setErrorMessage(null);
        setIsLoadingTemplates(true);
        const loadedTemplates = await listSchemaTemplates(
          form.dataType,
          controller.signal,
        );
        setTemplates(loadedTemplates);
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Schema templates could not be loaded.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => controller.abort();
  }, [form.dataType]);

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId);
    setSuccessMessage(null);
    setErrorMessage(null);
    router.replace(`/projects/${projectId}/uploads`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);

    if (!selectedProjectId) {
      setErrorMessage("Create a project before adding uploads.");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("Choose a CSV or XLSX file to continue.");
      return;
    }

    if (form.dataType === "gpr") {
      if (!form.gpr.fileIdentifier.trim()) {
        setErrorMessage("GPR uploads require a file identifier before mapping.");
        return;
      }
      if (form.gpr.channelCount < 1) {
        setErrorMessage("GPR channel count must be at least 1.");
        return;
      }
      if (form.gpr.interfaceCount < 1) {
        setErrorMessage("GPR interface count must be at least 1.");
        return;
      }
    }

    startTransition(() => {
      void (async () => {
        try {
          const createdUpload = await createProjectUpload({
            projectId: selectedProjectId,
            dataType: form.dataType,
            notes: form.notes.trim(),
            file: selectedFile,
            gprImportConfig:
              form.dataType === "gpr"
                ? {
                    fileIdentifier: form.gpr.fileIdentifier.trim(),
                    channelCount: form.gpr.channelCount,
                    channelLabels: buildLabelMap(form.gpr.channelLabels),
                    interfaceCount: form.gpr.interfaceCount,
                    interfaceLabels: buildLabelMap(form.gpr.interfaceLabels),
                  }
                : null,
          });

          setUploads((current) => [createdUpload, ...current]);
          setForm((current) => ({
            ...current,
            notes: "",
            gpr: initialFormState.gpr,
          }));
          setSelectedFile(null);
          setErrorMessage(null);
          setSuccessMessage(`Recorded upload ${createdUpload.filename}.`);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Upload could not be created.",
          );
        }
      })();
    });
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <div className="stack-lg">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload Intake</p>
            <h2>Record a source file against a project.</h2>
          </div>
          <p className="section-copy">
            Store source file bytes locally, tie them to a project, and prepare them for
            real preview, mapping, and normalization work.
          </p>
        </div>

        {isBootstrapping ? (
          <p className="empty-state">Loading upload workspace...</p>
        ) : projects.length === 0 ? (
          <div className="stack-sm">
            <p className="empty-state">
              No projects exist yet. Create one first, then return here to attach files.
            </p>
            <div>
              <Link className="button-primary" href="/projects">
                Create a project
              </Link>
            </div>
          </div>
        ) : (
          <form className="project-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                <span>Project</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => handleProjectChange(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_code} | {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Data type</span>
                <select
                  value={form.dataType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dataType: event.target.value as DataType,
                    }))
                  }
                >
                  {dataTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-full">
                <span>File</span>
                <input
                  key={selectedFile?.name ?? "upload-file-input"}
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
              </label>

              {form.dataType === "gpr" ? (
                <>
                  <label>
                    <span>File identifier</span>
                    <input
                      value={form.gpr.fileIdentifier}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          gpr: {
                            ...current.gpr,
                            fileIdentifier: event.target.value,
                          },
                        }))
                      }
                      placeholder="Lane 1, Lane 2, Aux Lane, Ramp A"
                    />
                  </label>

                  <label>
                    <span>Channel count</span>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={form.gpr.channelCount}
                      onChange={(event) =>
                        setForm((current) => {
                          const channelCount = clampCount(event.target.value, 64);
                          return {
                            ...current,
                            gpr: {
                              ...current.gpr,
                              channelCount,
                              channelLabels: resizeLabels(
                                current.gpr.channelLabels,
                                channelCount,
                              ),
                            },
                          };
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>Interface count</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={form.gpr.interfaceCount}
                      onChange={(event) =>
                        setForm((current) => {
                          const interfaceCount = clampCount(event.target.value, 24);
                          return {
                            ...current,
                            gpr: {
                              ...current.gpr,
                              interfaceCount,
                              interfaceLabels: resizeLabels(
                                current.gpr.interfaceLabels,
                                interfaceCount,
                              ),
                            },
                          };
                        })
                      }
                    />
                  </label>

                  <div className="field-full stack-sm">
                    <div>
                      <span>Optional channel labels</span>
                      <p className="inline-note">
                        Leave blank to default labels from channel number during
                        normalization.
                      </p>
                    </div>
                    <div className="form-grid">
                      {form.gpr.channelLabels.map((label, index) => (
                        <label key={`channel-label-${index + 1}`}>
                          <span>Channel {index + 1}</span>
                          <input
                            value={label}
                            onChange={(event) =>
                              setForm((current) => {
                                const channelLabels = [...current.gpr.channelLabels];
                                channelLabels[index] = event.target.value;
                                return {
                                  ...current,
                                  gpr: {
                                    ...current.gpr,
                                    channelLabels,
                                  },
                                };
                              })
                            }
                            placeholder={`Channel ${index + 1}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="field-full stack-sm">
                    <div>
                      <span>Optional interface labels</span>
                      <p className="inline-note">
                        These labels drive the required interface depth fields in the
                        mapping step.
                      </p>
                    </div>
                    <div className="form-grid">
                      {form.gpr.interfaceLabels.map((label, index) => (
                        <label key={`interface-label-${index + 1}`}>
                          <span>Interface {index + 1}</span>
                          <input
                            value={label}
                            onChange={(event) =>
                              setForm((current) => {
                                const interfaceLabels = [...current.gpr.interfaceLabels];
                                interfaceLabels[index] = event.target.value;
                                return {
                                  ...current,
                                  gpr: {
                                    ...current.gpr,
                                    interfaceLabels,
                                  },
                                };
                              })
                            }
                            placeholder={`Interface ${index + 1}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="field-full stack-sm">
                    <p className="inline-note">
                      GPR MVP intake supports single-channel files and multi-channel long
                      format only. Multi-channel wide format is intentionally unsupported
                      in this step.
                    </p>
                    <p className="inline-note">
                      Latitude and longitude can be mapped later for map display. Missing
                      GPS will warn but will not block import, and station or MP columns
                      are intentionally out of scope for this enhancement.
                    </p>
                  </div>
                </>
              ) : null}

              <label className="field-full">
                <span>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Optional notes about source, vendor layout, lane coverage, or collection run."
                  rows={4}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button-primary" type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Record upload"}
              </button>
              <p className="inline-note">
                Uploaded CSV and XLSX files are stored locally so preview and mapping can
                read the real source content.
              </p>
            </div>
          </form>
        )}

        {selectedProject ? (
          <div className="context-banner">
            <div>
              <div className="table-primary">{selectedProject.name}</div>
              <div className="table-secondary">{selectedProject.project_code}</div>
            </div>
            <p className="inline-note">
              {[selectedProject.route, selectedProject.roadway, selectedProject.direction]
                .filter(Boolean)
                .join(" / ") || "Route context not set yet"}
            </p>
          </div>
        ) : null}

        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
        {successMessage ? <p className="message success">{successMessage}</p> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload History</p>
            <h2>Current project uploads</h2>
          </div>
          <p className="section-copy">
            A lightweight operational list for the files already tied to this project.
          </p>
        </div>

        {!selectedProjectId ? (
          <p className="empty-state">Select a project to view upload history.</p>
        ) : isLoadingUploads ? (
          <p className="empty-state">Loading uploads...</p>
        ) : uploads.length === 0 ? (
          <p className="empty-state">
            No uploads yet for this project. Add the first file above to start the intake
            trail.
          </p>
        ) : (
          <div className="table-shell">
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Data type</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id}>
                    <td>
                      <div className="table-primary">{upload.filename}</div>
                    </td>
                    <td>{upload.data_type.toUpperCase()}</td>
                    <td>{upload.file_format.toUpperCase()}</td>
                    <td>
                      <span className={`status-pill status-${upload.status}`}>
                        {upload.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>{formatTimestamp(upload.uploaded_at)}</td>
                    <td>{upload.notes ?? "None"}</td>
                    <td>
                      <Link
                        className="button-secondary button-inline"
                        href={`/projects/${selectedProjectId}/uploads/${upload.id}/mapping`}
                      >
                        Map columns
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schema Templates</p>
            <h2>Templates for {form.dataType.toUpperCase()}</h2>
          </div>
          <p className="section-copy">
            These baseline mappings show the columns RoadViz expects to align during a
            later normalization step.
          </p>
        </div>

        {isLoadingTemplates ? (
          <p className="empty-state">Loading schema templates...</p>
        ) : templates.length === 0 ? (
          <p className="empty-state">
            No templates yet for this data type. Add them through the backend API as the
            vendor layouts become clearer.
          </p>
        ) : (
          <div className="template-grid">
            {templates.map((template) => (
              <article className="template-card" key={template.id}>
                <div className="template-card-header">
                  <div>
                    <div className="table-primary">{template.name}</div>
                    <div className="table-secondary">
                      Updated {formatTimestamp(template.updated_at)}
                    </div>
                  </div>
                  {template.is_default ? (
                    <span className="status-pill status-received">Default</span>
                  ) : null}
                </div>

                <div className="mapping-list">
                  {Object.entries(template.field_mappings).map(([field, mappedColumn]) => (
                    <div className="mapping-row" key={field}>
                      <span>{field}</span>
                      <code>{mappedColumn}</code>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
