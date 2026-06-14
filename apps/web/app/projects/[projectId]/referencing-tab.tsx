"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getProjectStationMilepostTies,
  saveProjectStationMilepostTies,
  updateProject,
  type LinearReferenceMode,
  type Project,
  type ProjectCreateInput,
  type ProjectExcludedSegment,
  type ProjectStationMilepostTieRow,
  type ProjectStationMilepostTieRowInput,
} from "../../../lib/projects";

type ReferencingTabProps = {
  project: Project;
  onProjectUpdated: (project: Project) => void;
  onCompletionChange: (isComplete: boolean) => void;
};

type ExcludedSegmentDraft = {
  id: string;
  stop_station: string;
  resume_station: string;
  description: string;
};

type TieDraft = {
  id: string;
  station: string;
  milepost: string;
  description: string;
};

type ProjectDraft = {
  start_station: string;
  end_station: string;
  linear_reference_mode: LinearReferenceMode;
  excluded_segments: ExcludedSegmentDraft[];
};

type ValidationResult = {
  issues: string[];
  beginStationValue: number | null;
  endStationValue: number | null;
};

function createDraftId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function trimOrNull(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseStationValue(station: string): number {
  const normalized = station.trim().replaceAll(" ", "");
  if (!normalized) {
    throw new Error("Station cannot be blank.");
  }

  if (!normalized.includes("+")) {
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) {
      throw new Error("Use a numeric station or civil format such as 123+45.67.");
    }
    return numeric;
  }

  const [stationPart, offsetPart] = normalized.split("+", 2);
  const stationNumber = Number.parseInt(stationPart, 10);
  const offset = Number(offsetPart);
  if (!Number.isFinite(stationNumber) || !Number.isFinite(offset)) {
    throw new Error("Use a numeric station or civil format such as 123+45.67.");
  }

  const sign = stationNumber < 0 ? -1 : 1;
  return stationNumber * 100 + sign * offset;
}

function buildProjectDraft(project: Project): ProjectDraft {
  return {
    start_station: project.start_station ?? "",
    end_station: project.end_station ?? "",
    linear_reference_mode: project.linear_reference_mode,
    excluded_segments: (project.excluded_segments ?? []).map((segment) => ({
      id: createDraftId(),
      stop_station: segment.stop_station,
      resume_station: segment.resume_station,
      description: segment.description ?? "",
    })),
  };
}

function buildTieDraftRows(rows: ProjectStationMilepostTieRow[]): TieDraft[] {
  if (rows.length === 0) {
    return [
      { id: createDraftId(), station: "", milepost: "", description: "" },
      { id: createDraftId(), station: "", milepost: "", description: "" },
    ];
  }

  return rows.map((row) => ({
    id: createDraftId(),
    station: row.station,
    milepost: String(row.milepost),
    description: row.description ?? "",
  }));
}

function normalizeExcludedSegments(
  rows: ExcludedSegmentDraft[],
): ProjectExcludedSegment[] {
  return rows
    .filter(
      (row) =>
        row.stop_station.trim() ||
        row.resume_station.trim() ||
        row.description.trim(),
    )
    .map((row) => ({
      stop_station: row.stop_station.trim(),
      resume_station: row.resume_station.trim(),
      description: trimOrNull(row.description),
    }));
}

function validateProjectDraft(draft: ProjectDraft): ValidationResult {
  const issues: string[] = [];

  const beginStation = draft.start_station.trim();
  const endStation = draft.end_station.trim();
  if (!beginStation || !endStation) {
    issues.push("Project begin and end station are required.");
    return {
      issues,
      beginStationValue: null,
      endStationValue: null,
    };
  }

  let beginStationValue: number;
  let endStationValue: number;
  try {
    beginStationValue = parseStationValue(beginStation);
    endStationValue = parseStationValue(endStation);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Station limits are invalid.");
    return {
      issues,
      beginStationValue: null,
      endStationValue: null,
    };
  }

  if (beginStationValue >= endStationValue) {
    issues.push("Project begin station must be less than project end station.");
  }

  const normalizedSegments = normalizeExcludedSegments(draft.excluded_segments);
  normalizedSegments.forEach((segment, index) => {
    let stopStationValue: number;
    let resumeStationValue: number;
    try {
      stopStationValue = parseStationValue(segment.stop_station);
      resumeStationValue = parseStationValue(segment.resume_station);
    } catch (error) {
      issues.push(
        `Excluded segment ${index + 1}: ${
          error instanceof Error ? error.message : "Stations are invalid."
        }`,
      );
      return;
    }

    if (stopStationValue >= resumeStationValue) {
      issues.push(
        `Excluded segment ${index + 1}: stop station must be less than resume station.`,
      );
    }
    if (
      stopStationValue < beginStationValue ||
      resumeStationValue > endStationValue
    ) {
      issues.push(
        `Excluded segment ${index + 1}: stations must stay within the project limits.`,
      );
    }
  });

  return {
    issues,
    beginStationValue,
    endStationValue,
  };
}

function normalizeTieRows(rows: TieDraft[]): ProjectStationMilepostTieRowInput[] {
  return rows
    .filter(
      (row) => row.station.trim() || row.milepost.trim() || row.description.trim(),
    )
    .map((row) => ({
      station: row.station.trim(),
      milepost: Number(row.milepost),
      description: trimOrNull(row.description),
    }));
}

function validateTieDrafts(rows: TieDraft[]): string[] {
  const issues: string[] = [];
  const normalizedRows = rows.filter(
    (row) => row.station.trim() || row.milepost.trim() || row.description.trim(),
  );

  if (normalizedRows.length < 2) {
    issues.push("At least 2 station-to-MP tie points are required.");
    return issues;
  }

  const seenStationValues = new Set<number>();
  for (const [index, row] of normalizedRows.entries()) {
    if (!row.station.trim()) {
      issues.push(`Tie row ${index + 1}: station is required.`);
      continue;
    }
    if (!row.milepost.trim()) {
      issues.push(`Tie row ${index + 1}: milepost is required.`);
      continue;
    }

    let stationValue: number;
    try {
      stationValue = parseStationValue(row.station);
    } catch (error) {
      issues.push(
        `Tie row ${index + 1}: ${
          error instanceof Error ? error.message : "station is invalid."
        }`,
      );
      continue;
    }

    const milepost = Number(row.milepost);
    if (!Number.isFinite(milepost)) {
      issues.push(`Tie row ${index + 1}: milepost must be numeric.`);
      continue;
    }

    if (seenStationValues.has(stationValue)) {
      issues.push(`Tie row ${index + 1}: station values must be unique.`);
    }
    seenStationValues.add(stationValue);
  }

  return issues;
}

function evaluateReferencingCompletion(
  project: Project,
  projectTies: ProjectStationMilepostTieRow[],
): ValidationResult {
  const result = validateProjectDraft(buildProjectDraft(project));
  if (project.linear_reference_mode === "stations_mileposts") {
    const tieIssues = validateTieDrafts(
      buildTieDraftRows(projectTies).map((row) => ({ ...row })),
    );
    result.issues.push(...tieIssues);
  }
  return result;
}

function buildProjectPayload(
  project: Project,
  draft: ProjectDraft,
): ProjectCreateInput {
  return {
    project_code: project.project_code,
    name: project.name,
    lane_count: project.lane_count,
    has_outside_shoulder: project.has_outside_shoulder,
    has_inside_shoulder: project.has_inside_shoulder,
    ramp_count: project.ramp_count,
    linear_reference_mode: draft.linear_reference_mode,
    client_name: project.client_name,
    route: project.route,
    roadway: project.roadway,
    direction: project.direction,
    county: project.county,
    state: project.state,
    start_mp: project.start_mp,
    end_mp: project.end_mp,
    start_station: trimOrNull(draft.start_station),
    end_station: trimOrNull(draft.end_station),
    excluded_segments: normalizeExcludedSegments(draft.excluded_segments),
    description: project.description,
    status: project.status,
  };
}

export default function ReferencingTab({
  project,
  onProjectUpdated,
  onCompletionChange,
}: ReferencingTabProps) {
  const [draft, setDraft] = useState<ProjectDraft>(() => buildProjectDraft(project));
  const [savedProjectTies, setSavedProjectTies] = useState<ProjectStationMilepostTieRow[]>(
    [],
  );
  const [tieDrafts, setTieDrafts] = useState<TieDraft[]>(() => buildTieDraftRows([]));
  const [isLoadingTies, setIsLoadingTies] = useState(true);
  const [isTieModalOpen, setIsTieModalOpen] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isSavingTies, setIsSavingTies] = useState(false);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [tieMessage, setTieMessage] = useState<string | null>(null);
  const [tieError, setTieError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(buildProjectDraft(project));
  }, [project]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTies() {
      try {
        setIsLoadingTies(true);
        setTieError(null);
        const tieTable = await getProjectStationMilepostTies(
          project.id,
          controller.signal,
        );
        const rows = tieTable?.rows ?? [];
        setSavedProjectTies(rows);
        setTieDrafts(buildTieDraftRows(rows));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setTieError(
          error instanceof Error ? error.message : "Project ties could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingTies(false);
        }
      }
    }

    void loadTies();

    return () => controller.abort();
  }, [project.id]);

  const completion = useMemo(
    () => evaluateReferencingCompletion(project, savedProjectTies),
    [project, savedProjectTies],
  );
  const isReferencingComplete = completion.issues.length === 0 && !isLoadingTies;

  useEffect(() => {
    onCompletionChange(isReferencingComplete);
  }, [isReferencingComplete, onCompletionChange]);

  const projectDraftValidation = useMemo(() => validateProjectDraft(draft), [draft]);
  const tieDraftValidation = useMemo(() => validateTieDrafts(tieDrafts), [tieDrafts]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateExcludedSegment(
    id: string,
    key: keyof ExcludedSegmentDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      excluded_segments: current.excluded_segments.map((segment) =>
        segment.id === id ? { ...segment, [key]: value } : segment,
      ),
    }));
  }

  function addExcludedSegment() {
    setDraft((current) => ({
      ...current,
      excluded_segments: [
        ...current.excluded_segments,
        {
          id: createDraftId(),
          stop_station: "",
          resume_station: "",
          description: "",
        },
      ],
    }));
  }

  function removeExcludedSegment(id: string) {
    setDraft((current) => ({
      ...current,
      excluded_segments: current.excluded_segments.filter((segment) => segment.id !== id),
    }));
  }

  function openTieModal() {
    setTieError(null);
    setTieMessage(null);
    setTieDrafts(buildTieDraftRows(savedProjectTies));
    setIsTieModalOpen(true);
  }

  function updateTieDraft(id: string, key: keyof TieDraft, value: string) {
    setTieDrafts((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  }

  function addTieDraft() {
    setTieDrafts((current) => [
      ...current,
      { id: createDraftId(), station: "", milepost: "", description: "" },
    ]);
  }

  function removeTieDraft(id: string) {
    setTieDrafts((current) => current.filter((row) => row.id !== id));
  }

  async function handleProjectSave() {
    if (projectDraftValidation.issues.length > 0) {
      setProjectError(projectDraftValidation.issues[0]);
      setProjectMessage(null);
      return;
    }

    try {
      setIsSavingProject(true);
      setProjectError(null);
      const updatedProject = await updateProject(
        project.id,
        buildProjectPayload(project, draft),
      );
      onProjectUpdated(updatedProject);
      setProjectMessage("Referencing saved.");
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Referencing limits could not be saved.",
      );
      setProjectMessage(null);
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleTieSave() {
    if (tieDraftValidation.length > 0) {
      setTieError(tieDraftValidation[0]);
      setTieMessage(null);
      return;
    }

    try {
      setIsSavingTies(true);
      setTieError(null);
      const savedTieTable = await saveProjectStationMilepostTies({
        projectId: project.id,
        rows: normalizeTieRows(tieDrafts),
      });
      setSavedProjectTies(savedTieTable.rows);
      setTieDrafts(buildTieDraftRows(savedTieTable.rows));
      setTieMessage("Station-to-MP ties saved.");
      setIsTieModalOpen(false);
    } catch (error) {
      setTieError(error instanceof Error ? error.message : "Tie table could not be saved.");
      setTieMessage(null);
    } finally {
      setIsSavingTies(false);
    }
  }

  const showTieSection = draft.linear_reference_mode === "stations_mileposts";

  return (
    <div className="referencing-stack">
      <div className="workspace-status-summary">
        <div>
          <p className="eyebrow">Referencing</p>
          <h2>Project limits and route referencing</h2>
          <p className="inline-note">Set limits and route ties.</p>
        </div>
        <span
          className={`status-pill ${
            isReferencingComplete ? "status-active" : "status-draft"
          }`}
        >
          {isReferencingComplete ? "Complete" : "Incomplete"}
        </span>
      </div>

      {!isReferencingComplete && completion.issues.length > 0 ? (
        <div className="validation-list">
          {completion.issues.map((issue) => (
            <p className="message warning" key={issue}>
              {issue}
            </p>
          ))}
        </div>
      ) : null}

      <div className="form-section">
        <div className="form-section-header">
          <h2>Project Station Limits</h2>
        </div>
        <div className="form-grid">
          <label>
            <span>Project Begin Station</span>
            <input
              value={draft.start_station}
              onChange={(event) => updateDraft("start_station", event.target.value)}
              placeholder="100+00"
            />
          </label>
          <label>
            <span>Project End Station</span>
            <input
              value={draft.end_station}
              onChange={(event) => updateDraft("end_station", event.target.value)}
              placeholder="150+00"
            />
          </label>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h2>Excluded Segments</h2>
        </div>
        {draft.excluded_segments.length === 0 ? (
          <p className="inline-note">Optional.</p>
        ) : null}
        <div className="repeatable-row-list">
          {draft.excluded_segments.map((segment) => (
            <div className="repeatable-row" key={segment.id}>
              <div className="form-grid">
                <label>
                  <span>Stop Station</span>
                  <input
                    value={segment.stop_station}
                    onChange={(event) =>
                      updateExcludedSegment(segment.id, "stop_station", event.target.value)
                    }
                    placeholder="112+50"
                  />
                </label>
                <label>
                  <span>Resume Station</span>
                  <input
                    value={segment.resume_station}
                    onChange={(event) =>
                      updateExcludedSegment(
                        segment.id,
                        "resume_station",
                        event.target.value,
                      )
                    }
                    placeholder="115+00"
                  />
                </label>
                <label className="field-full">
                  <span>Description</span>
                  <input
                    value={segment.description}
                    onChange={(event) =>
                      updateExcludedSegment(segment.id, "description", event.target.value)
                    }
                    placeholder="Bridge deck"
                  />
                </label>
              </div>
              <div className="repeatable-row-actions">
                <button
                  className="button-secondary button-inline"
                  type="button"
                  onClick={() => removeExcludedSegment(segment.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button
            className="button-secondary button-inline"
            type="button"
            onClick={addExcludedSegment}
          >
            Add Excluded Segment
          </button>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h2>Milepost Option</h2>
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={draft.linear_reference_mode === "stations_mileposts"}
            onChange={(event) =>
              updateDraft(
                "linear_reference_mode",
                event.target.checked ? "stations_mileposts" : "stations_only",
              )
            }
          />
          <span>Route includes Mileposts</span>
        </label>
        <p className="inline-note">Required only when mileposts are used.</p>
      </div>

      {showTieSection ? (
        <div className="form-section">
          <div className="form-section-header">
            <h2>Station to MP Ties</h2>
          </div>
          <div className="workspace-choice-row">
            <div>
              <div className="table-primary">
                {savedProjectTies.length === 0
                  ? "No project ties saved yet"
                  : `${savedProjectTies.length} project tie point${
                      savedProjectTies.length === 1 ? "" : "s"
                    } saved`}
              </div>
              <p className="inline-note">Project-level ties.</p>
            </div>
            <button
              className="button-secondary button-inline"
              type="button"
              onClick={openTieModal}
              disabled={isLoadingTies}
            >
              Set Station to MP Ties
            </button>
          </div>
          {savedProjectTies.length > 0 ? (
            <div className="table-shell">
              <table className="projects-table tie-table">
                <thead>
                  <tr>
                    <th>Station</th>
                    <th>Milepost</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {savedProjectTies.map((row, index) => (
                    <tr key={`${row.station}-${row.milepost}-${index}`}>
                      <td>{row.station}</td>
                      <td>{row.milepost}</td>
                      <td>{row.description ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {projectError ? <p className="message error">{projectError}</p> : null}
      {projectMessage ? <p className="message success">{projectMessage}</p> : null}
      {tieError && !isTieModalOpen ? <p className="message error">{tieError}</p> : null}
      {tieMessage ? <p className="message success">{tieMessage}</p> : null}

      <div className="form-actions">
        <button
          className="button-primary"
          type="button"
          onClick={() => void handleProjectSave()}
          disabled={isSavingProject || isSavingTies}
        >
          {isSavingProject ? "Saving..." : "Save Referencing"}
        </button>
      </div>

      {isTieModalOpen ? (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isSavingTies) {
              setIsTieModalOpen(false);
            }
          }}
        >
          <div
            className="workspace-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-ties-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 id="project-ties-modal-title">Station to MP Ties</h3>
                <p className="inline-note">Enter at least two tie points.</p>
              </div>
              <button
                className="button-secondary button-inline"
                type="button"
                onClick={() => setIsTieModalOpen(false)}
                disabled={isSavingTies}
              >
                Close
              </button>
            </div>

            <div className="table-shell">
              <table className="projects-table tie-table">
                <thead>
                  <tr>
                    <th>Station</th>
                    <th>Milepost</th>
                    <th>Description</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {tieDrafts.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          value={row.station}
                          onChange={(event) =>
                            updateTieDraft(row.id, "station", event.target.value)
                          }
                          placeholder="100+00"
                        />
                      </td>
                      <td>
                        <input
                          value={row.milepost}
                          onChange={(event) =>
                            updateTieDraft(row.id, "milepost", event.target.value)
                          }
                          placeholder="10.000"
                        />
                      </td>
                      <td>
                        <input
                          value={row.description}
                          onChange={(event) =>
                            updateTieDraft(row.id, "description", event.target.value)
                          }
                          placeholder="Project start"
                        />
                      </td>
                      <td>
                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() => removeTieDraft(row.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tieDraftValidation.length > 0 ? (
              <div className="validation-list">
                {tieDraftValidation.map((issue) => (
                  <p className="message warning" key={issue}>
                    {issue}
                  </p>
                ))}
              </div>
            ) : null}
            {tieError ? <p className="message error">{tieError}</p> : null}

            <div className="form-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={addTieDraft}
                disabled={isSavingTies}
              >
                Add Tie Point
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={() => void handleTieSave()}
                disabled={isSavingTies}
              >
                {isSavingTies ? "Saving..." : "Save Ties"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
