"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import { listProjects, type Project } from "../../lib/projects";

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatScope(project: Project): string {
  const directions = project.direction ?? "Not set";
  const lanes = `${project.lane_count} lane${project.lane_count === 1 ? "" : "s"}`;
  return `${directions} | ${lanes}`;
}

function formatRouteRoadway(project: Project): string {
  return [project.route, project.roadway].filter(Boolean).join(" / ") || "Not set";
}

export default function ProjectsClient() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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

  function handleImportSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (selectedFile === null) {
      return;
    }

    setImportMessage(
      `Selected ${selectedFile.name}. Project import is not available yet.`,
    );
    event.target.value = "";
  }

  return (
    <section className="panel registry-panel">
      <div className="registry-header">
        <div>
          <p className="eyebrow">Project Registry</p>
          <h1>RoadViz projects</h1>
          <p className="section-copy">Open a project or create a new one.</p>
        </div>

        <div className="registry-actions">
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept=".rvz,.zip,.roadviz"
            onChange={handleImportSelection}
          />
          <button
            className="button-secondary"
            type="button"
            onClick={() => importInputRef.current?.click()}
          >
            Import Project
          </button>
          <Link className="button-primary" href="/projects/new">
            New Project
          </Link>
        </div>
      </div>

      {importMessage ? <p className="message warning">{importMessage}</p> : null}
      {errorMessage ? <p className="message error">{errorMessage}</p> : null}

      {isLoading ? (
        <p className="empty-state">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="registry-empty">
          <p className="empty-state">No projects yet.</p>
          <Link className="button-primary" href="/projects/new">
            New Project
          </Link>
        </div>
      ) : (
        <div className="table-shell">
          <table className="projects-table registry-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client / Owner</th>
                <th>Route / Roadway</th>
                <th>Scope</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="registry-row"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <td>
                    <div className="table-primary">{project.name}</div>
                    <div className="table-secondary">{project.project_code}</div>
                  </td>
                  <td>{project.client_name ?? "Not set"}</td>
                  <td>{formatRouteRoadway(project)}</td>
                  <td>{formatScope(project)}</td>
                  <td>{formatTimestamp(project.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
