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
};

const initialFormState: UploadFormState = {
  dataType: "gpr",
  notes: "",
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

    startTransition(() => {
      void (async () => {
        try {
          const createdUpload = await createProjectUpload({
            projectId: selectedProjectId,
            dataType: form.dataType,
            notes: form.notes.trim(),
            file: selectedFile,
          });

          setUploads((current) => [createdUpload, ...current]);
          setForm((current) => ({ ...current, notes: "" }));
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
            This first foundation stores upload metadata and lines it up with the
            template-driven mapping flow that will come next.
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
                Selected file bytes are not persisted yet. This step creates the upload
                record and reserves the contract for real storage later.
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
