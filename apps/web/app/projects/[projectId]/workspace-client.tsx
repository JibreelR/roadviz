"use client";

import { useEffect, useMemo, useState } from "react";

import { getProject, type Project } from "../../../lib/projects";
import ReferencingTab from "./referencing-tab";

type WorkspaceTab =
  | "referencing"
  | "gpr"
  | "coring"
  | "dcp"
  | "fwd"
  | "dashboard"
  | "report";

type GprSubTab = "upload" | "mapping" | "plot";
type DashboardSubTab =
  | "general"
  | "gpr"
  | "coring"
  | "dcp"
  | "fwd"
  | "view";

const workspaceTabs: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "referencing", label: "Referencing" },
  { key: "gpr", label: "GPR" },
  { key: "coring", label: "Coring" },
  { key: "dcp", label: "DCP" },
  { key: "fwd", label: "FWD" },
  { key: "dashboard", label: "Dashboard" },
  { key: "report", label: "Report" },
];

const gprSubTabs: Array<{ key: GprSubTab; label: string }> = [
  { key: "upload", label: "Data Upload" },
  { key: "mapping", label: "Mapping & Labels" },
  { key: "plot", label: "Plot Settings" },
];

const dashboardSubTabs: Array<{ key: DashboardSubTab; label: string }> = [
  { key: "general", label: "General" },
  { key: "gpr", label: "GPR" },
  { key: "coring", label: "Coring" },
  { key: "dcp", label: "DCP" },
  { key: "fwd", label: "FWD" },
  { key: "view", label: "Dashboard View" },
];

function buildScopeSummary(project: Project): string {
  const directions = project.direction ?? "Directions pending";
  const shoulders = [
    project.has_outside_shoulder ? "Outside shoulder" : null,
    project.has_inside_shoulder ? "Inside shoulder" : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const parts = [
    directions,
    `${project.lane_count} lane${project.lane_count === 1 ? "" : "s"}`,
    shoulders || null,
    project.ramp_count > 0
      ? `${project.ramp_count} ramp${project.ramp_count === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return parts.join(" | ");
}

function formatRouteRoadway(project: Project): string {
  return [project.route, project.roadway].filter(Boolean).join(" / ") || "Not set";
}

function formatLimits(project: Project): string {
  return [project.start_station, project.end_station].filter(Boolean).join(" to ") || "Not set";
}

export default function WorkspaceClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("referencing");
  const [activeGprSubTab, setActiveGprSubTab] = useState<GprSubTab>("upload");
  const [activeDashboardSubTab, setActiveDashboardSubTab] =
    useState<DashboardSubTab>("general");
  const [referencingComplete, setReferencingComplete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProject() {
      try {
        setErrorMessage(null);
        const loadedProject = await getProject(projectId, controller.signal);
        setProject(loadedProject);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setErrorMessage(
          error instanceof Error ? error.message : "Project workspace could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProject();

    return () => controller.abort();
  }, [projectId]);

  const activeTabLabel = useMemo(
    () => workspaceTabs.find((tab) => tab.key === activeTab)?.label ?? "Workspace",
    [activeTab],
  );

  useEffect(() => {
    if (activeTab !== "referencing" && !referencingComplete) {
      setActiveTab("referencing");
    }
  }, [activeTab, referencingComplete]);

  if (isLoading || project === null) {
    return <p className="empty-state">Loading workspace...</p>;
  }

  return (
    <div className="workspace-shell">
      {errorMessage ? <p className="message error">{errorMessage}</p> : null}

      <section className="panel workspace-header-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project Workspace</p>
            <h1>{project.name}</h1>
          </div>
          <p className="section-copy">
            Referencing is the first required setup step. Complete the project
            station limits and route-referencing configuration here before the
            testing modules unlock.
          </p>
        </div>

        <div className="workspace-summary-grid">
          <div className="workspace-summary-item">
            <div className="table-secondary">Project code</div>
            <div className="table-primary">{project.project_code}</div>
          </div>
          <div className="workspace-summary-item">
            <div className="table-secondary">Client / Owner</div>
            <div className="table-primary">{project.client_name ?? "Not set"}</div>
          </div>
          <div className="workspace-summary-item">
            <div className="table-secondary">Route / Roadway</div>
            <div className="table-primary">{formatRouteRoadway(project)}</div>
          </div>
          <div className="workspace-summary-item">
            <div className="table-secondary">Scope</div>
            <div className="table-primary">{buildScopeSummary(project)}</div>
          </div>
          <div className="workspace-summary-item">
            <div className="table-secondary">Limits</div>
            <div className="table-primary">{formatLimits(project)}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="workspace-tabs" role="tablist" aria-label="Workspace modules">
          {workspaceTabs.map((tab) => {
            const isBlocked = tab.key !== "referencing" && !referencingComplete;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                className={`workspace-tab ${isActive ? "workspace-tab-active" : ""} ${
                  isBlocked ? "workspace-tab-blocked" : ""
                }`}
                type="button"
                onClick={() => {
                  if (!isBlocked) {
                    setActiveTab(tab.key);
                  }
                }}
                disabled={isBlocked}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel workspace-stage-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{activeTabLabel}</p>
            <h2>
              {activeTab === "referencing"
                ? "Complete project referencing first"
                : `${activeTabLabel} workspace shell`}
            </h2>
          </div>
          {activeTab !== "referencing" && !referencingComplete ? (
            <span className="status-pill status-draft">Blocked until referencing</span>
          ) : null}
        </div>

        {activeTab === "referencing" ? (
          <ReferencingTab
            project={project}
            onProjectUpdated={setProject}
            onCompletionChange={setReferencingComplete}
          />
        ) : null}

        {activeTab === "gpr" ? (
          <div className="placeholder-stack">
            <div className="subtab-row" role="tablist" aria-label="GPR sections">
              {gprSubTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`subtab-button ${
                    activeGprSubTab === tab.key ? "subtab-button-active" : ""
                  } ${!referencingComplete ? "subtab-button-blocked" : ""}`}
                  type="button"
                  onClick={() => setActiveGprSubTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="placeholder-panel">
              <div className="table-primary">GPR module shell ready</div>
              <p className="inline-note">
                The GPR workspace is being reshaped around clean upload, mapping, and
                plotting sections. Detailed behavior stays out of this phase.
              </p>
            </div>
          </div>
        ) : null}

        {activeTab === "coring" ? (
          <div className="placeholder-panel">
            <div className="table-primary">Import Coring Data</div>
            <p className="inline-note">
              This tab is reserved for the future coring import model and supporting
              workspace tools.
            </p>
          </div>
        ) : null}

        {activeTab === "dcp" ? (
          <div className="placeholder-panel">
            <div className="table-primary">DCP workspace placeholder</div>
            <p className="inline-note">
              The DCP module shell is in place and will be wired into the project
              workspace in a later phase.
            </p>
          </div>
        ) : null}

        {activeTab === "fwd" ? (
          <div className="placeholder-panel">
            <div className="table-primary">FWD workspace placeholder</div>
            <p className="inline-note">
              The FWD module shell is in place and ready for detailed workflow work in
              a later phase.
            </p>
          </div>
        ) : null}

        {activeTab === "dashboard" ? (
          <div className="placeholder-stack">
            <div className="subtab-row" role="tablist" aria-label="Dashboard sections">
              {dashboardSubTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`subtab-button ${
                    activeDashboardSubTab === tab.key ? "subtab-button-active" : ""
                  } ${!referencingComplete ? "subtab-button-blocked" : ""}`}
                  type="button"
                  onClick={() => setActiveDashboardSubTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="placeholder-panel">
              <div className="table-primary">Dashboard structure ready</div>
              <p className="inline-note">
                General, module-specific, and combined dashboard views now have a clear
                place in the product structure without bringing charts into this phase.
              </p>
            </div>
          </div>
        ) : null}

        {activeTab === "report" ? (
          <div className="placeholder-panel">
            <div className="table-primary">Report placeholder</div>
            <p className="inline-note">
              Reporting will plug into this tab once the core project and module flows
              are in place.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
