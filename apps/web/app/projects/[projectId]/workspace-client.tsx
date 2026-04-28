"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getProject,
  getProjectStationMilepostTies,
  saveProjectStationMilepostTies,
  updateProject,
  type LinearReferenceMode,
  type Project,
  type ProjectCreateInput,
  type ProjectStationMilepostTieTable,
} from "../../../lib/projects";
import {
  createProjectUpload,
  enrichUpload,
  getEnrichedUpload,
  getUploadDistanceStationTies,
  getUploadDownloadUrl,
  getUploadMapping,
  getUploadMappingDefinition,
  getUploadPreview,
  listProjectUploads,
  normalizeUpload,
  saveUploadDistanceStationTies,
  saveUploadMapping,
  validateUploadMapping,
  type CustomFieldMapping,
  type EnrichedResultSet,
  type MappingDefinition,
  type UploadDistanceStationTieTable,
  type UploadMappingState,
  type UploadPreview,
  type UploadRecord,
} from "../../../lib/uploads";

type ModuleTab = "gpr" | "core" | "dcp" | "fwd";
type MappingMode = "same" | "separate";

type RoadwayElement = {
  key: string;
  label: string;
  kind: "lane" | "outside_shoulder" | "inside_shoulder" | "ramp";
};

type ProjectSetupForm = {
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
  status: Project["status"];
};

type UploadFormState = {
  file: File | null;
  notes: string;
  channel_count: string;
  interface_count: string;
};

type TieRowForm = {
  distance: string;
  station: string;
};

type ProjectTieRowForm = {
  station: string;
  milepost: string;
};

type UploadWorkflowState = {
  hasUploadTies: boolean;
  hasSavedMapping: boolean;
  mappingIsValid: boolean;
  isEnriched: boolean;
};

type RowMappingContext = {
  preview: UploadPreview;
  definition: MappingDefinition;
  mappingState: UploadMappingState;
};

const MAX_CUSTOM_FIELDS = 10;

const moduleTabs: Array<{ key: ModuleTab; label: string }> = [
  { key: "gpr", label: "GPR" },
  { key: "core", label: "Coring" },
  { key: "dcp", label: "DCP" },
  { key: "fwd", label: "FWD" },
];

const defaultUploadFormState: UploadFormState = {
  file: null,
  notes: "",
  channel_count: "1",
  interface_count: "1",
};

const defaultTieRows: TieRowForm[] = [
  { distance: "0", station: "0+00" },
  { distance: "100", station: "1+00" },
];

const defaultProjectTieRows: ProjectTieRowForm[] = [
  { station: "0+00", milepost: "0" },
  { station: "1+00", milepost: "0.02" },
];

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
    throw new Error("Milepost values must be numeric.");
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

function buildRoadwayElements(project: Project): RoadwayElement[] {
  const elements: RoadwayElement[] = [];

  for (let laneNumber = 1; laneNumber <= project.lane_count; laneNumber += 1) {
    elements.push({
      key: `lane-${laneNumber}`,
      label: `Lane ${laneNumber}`,
      kind: "lane",
    });
  }

  if (project.has_outside_shoulder) {
    elements.push({
      key: "outside-shoulder",
      label: "Outside Shoulder",
      kind: "outside_shoulder",
    });
  }

  if (project.has_inside_shoulder) {
    elements.push({
      key: "inside-shoulder",
      label: "Inside Shoulder",
      kind: "inside_shoulder",
    });
  }

  for (let rampNumber = 1; rampNumber <= project.ramp_count; rampNumber += 1) {
    elements.push({
      key: `ramp-${rampNumber}`,
      label: `Ramp ${rampNumber}`,
      kind: "ramp",
    });
  }

  return elements;
}

function buildProjectSetupForm(project: Project): ProjectSetupForm {
  return {
    project_code: project.project_code,
    name: project.name,
    lane_count: String(project.lane_count),
    has_outside_shoulder: project.has_outside_shoulder,
    has_inside_shoulder: project.has_inside_shoulder,
    ramp_count: String(project.ramp_count),
    linear_reference_mode: project.linear_reference_mode,
    client_name: project.client_name ?? "",
    route: project.route ?? "",
    roadway: project.roadway ?? "",
    direction: project.direction ?? "",
    county: project.county ?? "",
    state: project.state ?? "",
    start_mp: project.start_mp?.toString() ?? "",
    end_mp: project.end_mp?.toString() ?? "",
    start_station: project.start_station ?? "",
    end_station: project.end_station ?? "",
    description: project.description ?? "",
    status: project.status,
  };
}

function buildProjectUpdatePayload(form: ProjectSetupForm): ProjectCreateInput {
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

function buildProjectTieRowsFromTable(
  tieTable: ProjectStationMilepostTieTable,
): ProjectTieRowForm[] {
  return tieTable.rows.map((row) => ({
    station: row.station,
    milepost: String(row.milepost),
  }));
}

function buildUploadTieRowsFromTable(
  tieTable: UploadDistanceStationTieTable,
): TieRowForm[] {
  return tieTable.rows.map((row) => ({
    distance: String(row.distance),
    station: row.station,
  }));
}

function isMissingProjectTieTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "Project station/MP tie table not found."
  );
}

function isMissingUploadTieTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "Upload distance/station tie table not found."
  );
}

function isMissingEnrichedResultError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "Enriched results not found. Apply ties for this upload first."
  );
}

function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = window.localStorage.getItem(key);
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function saveStoredJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function formatLinearReferenceMode(mode: LinearReferenceMode): string {
  return mode === "stations_only" ? "Stations only" : "Stations + Mileposts";
}

function describeMappingMode(mode: MappingMode | null): string {
  if (mode === null) {
    return "Choose how file mapping should be handled.";
  }
  if (mode === "same") {
    return "One saved mapping will be reused across all uploaded GPR rows.";
  }
  return "Each roadway row keeps its own mapping.";
}

function firstSampleValue(preview: UploadPreview, columnName: string): string {
  const sourceColumn = preview.source_columns.find((column) => column.name === columnName);
  const value = sourceColumn?.sample_values[0] ?? null;
  return value && value.trim() ? value : "Empty";
}

function formatOptionalNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) {
    return "";
  }
  return value.toFixed(digits);
}

function buildInterfaceSummary(result: EnrichedResultSet["preview_rows"][number]): string {
  if (result.normalized_row.data_type !== "gpr") {
    return "";
  }

  const entries = result.normalized_row.normalized_values.interface_depths
    .map((item) =>
      item.depth === null ? null : `${item.interface_label}: ${item.depth.toFixed(2)}`,
    )
    .filter((value): value is string => value !== null);

  return entries.join(" | ");
}

export default function WorkspaceClient({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<ModuleTab>("gpr");
  const [project, setProject] = useState<Project | null>(null);
  const [projectSetupForm, setProjectSetupForm] = useState<ProjectSetupForm | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadWorkflowState>>({});
  const [mappingMode, setMappingMode] = useState<MappingMode | null>(null);
  const [sharedMappingUploadId, setSharedMappingUploadId] = useState<string>("");
  const [hiddenUploadIds, setHiddenUploadIds] = useState<string[]>([]);
  const [projectTieTable, setProjectTieTable] =
    useState<ProjectStationMilepostTieTable | null>(null);
  const [projectTieRows, setProjectTieRows] =
    useState<ProjectTieRowForm[]>(defaultProjectTieRows);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [isSavingProjectTies, setIsSavingProjectTies] = useState(false);
  const [activeUploadElement, setActiveUploadElement] = useState<RoadwayElement | null>(null);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(defaultUploadFormState);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTieElement, setActiveTieElement] = useState<RoadwayElement | null>(null);
  const [activeTieUploadId, setActiveTieUploadId] = useState<string>("");
  const [tieRows, setTieRows] = useState<TieRowForm[]>(defaultTieRows);
  const [isSavingTies, setIsSavingTies] = useState(false);
  const [activePreviewElement, setActivePreviewElement] = useState<RoadwayElement | null>(null);
  const [processedPreview, setProcessedPreview] = useState<EnrichedResultSet | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingModalStep, setMappingModalStep] = useState<"mode" | "detail">("mode");
  const [isSetupDrawerOpen, setIsSetupDrawerOpen] = useState(false);
  const [isProjectTieDrawerOpen, setIsProjectTieDrawerOpen] = useState(false);
  const [activeMappingElement, setActiveMappingElement] = useState<RoadwayElement | null>(null);
  const [activeMappingUploadId, setActiveMappingUploadId] = useState<string>("");
  const [mappingContext, setMappingContext] = useState<RowMappingContext | null>(null);
  const [mappingReuseSourceId, setMappingReuseSourceId] = useState<string>("");
  const [isLoadingMapping, setIsLoadingMapping] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [processingUploadIds, setProcessingUploadIds] = useState<string[]>([]);

  const mappingModeStorageKey = `roadviz:${projectId}:gpr-mapping-mode`;
  const mappingReferenceStorageKey = `roadviz:${projectId}:gpr-shared-mapping-upload`;
  const hiddenUploadStorageKey = `roadviz:${projectId}:workspace-hidden-uploads`;

  useEffect(() => {
    setMappingMode(loadStoredJson<MappingMode | null>(mappingModeStorageKey, null));
    setSharedMappingUploadId(loadStoredJson<string>(mappingReferenceStorageKey, ""));
    setHiddenUploadIds(loadStoredJson<string[]>(hiddenUploadStorageKey, []));
  }, [hiddenUploadStorageKey, mappingModeStorageKey, mappingReferenceStorageKey]);

  useEffect(() => {
    saveStoredJson(mappingModeStorageKey, mappingMode);
  }, [mappingMode, mappingModeStorageKey]);

  useEffect(() => {
    saveStoredJson(mappingReferenceStorageKey, sharedMappingUploadId);
  }, [mappingReferenceStorageKey, sharedMappingUploadId]);

  useEffect(() => {
    saveStoredJson(hiddenUploadStorageKey, hiddenUploadIds);
  }, [hiddenUploadIds, hiddenUploadStorageKey]);

  async function loadWorkspace() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const [loadedProject, loadedUploads] = await Promise.all([
        getProject(projectId),
        listProjectUploads(projectId),
      ]);

      setProject(loadedProject);
      setProjectSetupForm(buildProjectSetupForm(loadedProject));
      setUploads(loadedUploads);

      try {
        const loadedProjectTies = await getProjectStationMilepostTies(projectId);
        setProjectTieTable(loadedProjectTies);
        setProjectTieRows(buildProjectTieRowsFromTable(loadedProjectTies));
      } catch (error) {
        if (isMissingProjectTieTableError(error)) {
          setProjectTieTable(null);
          setProjectTieRows(defaultProjectTieRows);
        } else {
          throw error;
        }
      }

      const gprUploads = loadedUploads.filter((upload) => upload.data_type === "gpr");
      const stateEntries = await Promise.all(
        gprUploads.map(async (upload) => {
          let hasUploadTies = false;
          let hasSavedMapping = false;
          let mappingIsValid = false;
          let isEnriched = false;

          try {
            await getUploadDistanceStationTies(upload.id);
            hasUploadTies = true;
          } catch (error) {
            if (!isMissingUploadTieTableError(error)) {
              throw error;
            }
          }

          const mapping = await getUploadMapping(upload.id);
          hasSavedMapping = mapping.is_saved;
          if (mapping.is_saved) {
            const validation = await validateUploadMapping({
              uploadId: upload.id,
              assignments: mapping.assignments,
              customFields: mapping.custom_fields,
            });
            mappingIsValid = validation.is_valid;
          }

          try {
            await getEnrichedUpload(upload.id);
            isEnriched = true;
          } catch (error) {
            if (!isMissingEnrichedResultError(error)) {
              throw error;
            }
          }

          return [
            upload.id,
            {
              hasUploadTies,
              hasSavedMapping,
              mappingIsValid,
              isEnriched,
            },
          ] as const;
        }),
      );

      setUploadStates(Object.fromEntries(stateEntries));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The project workspace could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [projectId]);

  const roadwayElements = useMemo(
    () => (project === null ? [] : buildRoadwayElements(project)),
    [project],
  );

  const visibleUploads = useMemo(
    () => uploads.filter((upload) => !hiddenUploadIds.includes(upload.id)),
    [hiddenUploadIds, uploads],
  );

  const gprUploads = useMemo(
    () => visibleUploads.filter((upload) => upload.data_type === "gpr"),
    [visibleUploads],
  );

  const requiresProjectMileposts =
    project?.linear_reference_mode === "stations_mileposts";
  const isGprWorkflowLocked = requiresProjectMileposts && projectTieTable === null;

  const gprRows = useMemo(
    () =>
      roadwayElements.map((element) => {
        const matchingUploads = gprUploads
          .filter((upload) => upload.gpr_import_config?.file_identifier === element.label)
          .sort(
            (left, right) =>
              new Date(right.uploaded_at).getTime() - new Date(left.uploaded_at).getTime(),
          );
        const latestUpload = matchingUploads[0] ?? null;
        const workflowState = latestUpload
          ? uploadStates[latestUpload.id] ?? {
              hasUploadTies: false,
              hasSavedMapping: false,
              mappingIsValid: false,
              isEnriched: false,
            }
          : {
              hasUploadTies: false,
              hasSavedMapping: false,
              mappingIsValid: false,
              isEnriched: false,
            };
        const isProcessing =
          latestUpload !== null && processingUploadIds.includes(latestUpload.id);

        let statusLabel = "Needs upload";
        let detail = "Upload the source file to begin.";

        if (latestUpload !== null) {
          statusLabel = "Needs mapping";
          detail = "Set the file mapping to finish file setup.";

          if (isProcessing) {
            statusLabel = "Processing";
            detail = "RoadViz is preparing the processed result for this file.";
          } else if (workflowState.isEnriched) {
            statusLabel = "Ready";
            detail = "Processed results are ready.";
          } else if (!workflowState.hasSavedMapping) {
            statusLabel = "Needs mapping";
            detail = "Set the file mapping to finish file setup.";
          } else if (!workflowState.mappingIsValid) {
            statusLabel = "Fix mapping";
            detail = "Update the saved mapping before RoadViz can continue.";
          } else if (!workflowState.hasUploadTies) {
            statusLabel = "Needs ties";
            detail = "Add upload ties for this file.";
          } else if (requiresProjectMileposts && projectTieTable === null) {
            statusLabel = "Needs project ties";
            detail = "Set project station and milepost ties first.";
          } else {
            statusLabel = "Ready";
            detail = "Setup is complete. RoadViz will process the file automatically.";
          }
        }

        return {
          element,
          latestUpload,
          workflowState,
          isProcessing,
          statusLabel,
          detail,
        };
      }),
    [
      gprUploads,
      processingUploadIds,
      projectTieTable,
      requiresProjectMileposts,
      roadwayElements,
      uploadStates,
    ],
  );

  const mappingReuseCandidates = useMemo(() => {
    if (!activeMappingUploadId) {
      return [];
    }
    return gprRows.filter(
      (row) =>
        row.latestUpload !== null &&
        row.latestUpload.id !== activeMappingUploadId &&
        (uploadStates[row.latestUpload.id]?.hasSavedMapping ?? false),
    );
  }, [activeMappingUploadId, gprRows, uploadStates]);

  const sharedMappingRow =
    gprRows.find((row) => row.latestUpload?.id === sharedMappingUploadId) ?? null;

  useEffect(() => {
    if (project === null || isLoading || isGprWorkflowLocked) {
      return;
    }

    const nextReadyUpload = gprRows.find(
      (row) =>
        row.latestUpload !== null &&
        !row.workflowState.isEnriched &&
        row.workflowState.hasSavedMapping &&
        row.workflowState.mappingIsValid &&
        row.workflowState.hasUploadTies &&
        !row.isProcessing,
    )?.latestUpload;

    if (nextReadyUpload === null || nextReadyUpload === undefined) {
      return;
    }

    void maybeAutoProcessUpload(nextReadyUpload);
  }, [gprRows, isGprWorkflowLocked, isLoading, project]);

  function markProcessing(uploadId: string, isProcessing: boolean) {
    setProcessingUploadIds((current) => {
      if (isProcessing) {
        return current.includes(uploadId) ? current : [...current, uploadId];
      }
      return current.filter((value) => value !== uploadId);
    });
  }

  async function ensureProjectTieRequirement(): Promise<boolean> {
    if (!requiresProjectMileposts) {
      return true;
    }
    if (projectTieTable !== null) {
      return true;
    }

    try {
      const loadedProjectTies = await getProjectStationMilepostTies(projectId);
      setProjectTieTable(loadedProjectTies);
      setProjectTieRows(buildProjectTieRowsFromTable(loadedProjectTies));
      return true;
    } catch (error) {
      if (isMissingProjectTieTableError(error)) {
        return false;
      }
      throw error;
    }
  }

  async function maybeAutoProcessUpload(upload: UploadRecord): Promise<boolean> {
    if (processingUploadIds.includes(upload.id)) {
      return true;
    }

    if (!(await ensureProjectTieRequirement())) {
      return false;
    }

    const mapping = await getUploadMapping(upload.id);
    if (!mapping.is_saved) {
      return false;
    }

    const validation = await validateUploadMapping({
      uploadId: upload.id,
      assignments: mapping.assignments,
      customFields: mapping.custom_fields,
    });
    if (!validation.is_valid) {
      return false;
    }

    try {
      await getUploadDistanceStationTies(upload.id);
    } catch (error) {
      if (isMissingUploadTieTableError(error)) {
        return false;
      }
      throw error;
    }

    markProcessing(upload.id, true);
    void (async () => {
      try {
        await normalizeUpload(upload.id);
        await enrichUpload(upload.id);
        setMessage(
          `${upload.gpr_import_config?.file_identifier ?? upload.filename} is ready.`,
        );
        await loadWorkspace();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Automatic processing could not finish.",
        );
      } finally {
        markProcessing(upload.id, false);
      }
    })();

    return true;
  }

  async function queueProjectProcessingCheck() {
    const candidates = gprRows
      .map((row) => row.latestUpload)
      .filter((upload): upload is UploadRecord => upload !== null);

    for (const upload of candidates) {
      try {
        await maybeAutoProcessUpload(upload);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "A ready file could not be processed automatically.",
        );
        break;
      }
    }
  }

  async function handleSaveProjectSetup() {
    if (project === null || projectSetupForm === null) {
      return;
    }

    try {
      setIsSavingSetup(true);
      setErrorMessage(null);
      const updatedProject = await updateProject(
        project.id,
        buildProjectUpdatePayload(projectSetupForm),
      );
      setProject(updatedProject);
      setProjectSetupForm(buildProjectSetupForm(updatedProject));
      setIsSetupDrawerOpen(false);
      setMessage("Project setup updated.");

      if (updatedProject.linear_reference_mode === "stations_only") {
        await queueProjectProcessingCheck();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Project setup could not be saved.",
      );
    } finally {
      setIsSavingSetup(false);
    }
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
      throw new Error("Enter at least two project tie rows.");
    }

    return rows;
  }

  async function handleSaveProjectTies() {
    if (project === null) {
      return;
    }

    try {
      setIsSavingProjectTies(true);
      setErrorMessage(null);
      const savedTieTable = await saveProjectStationMilepostTies({
        projectId: project.id,
        rows: buildProjectTiePayload(),
      });
      setProjectTieTable(savedTieTable);
      setProjectTieRows(buildProjectTieRowsFromTable(savedTieTable));
      setIsProjectTieDrawerOpen(false);
      setMessage("Project ties are ready.");
      await queueProjectProcessingCheck();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Project station/MP ties could not be saved.",
      );
    } finally {
      setIsSavingProjectTies(false);
    }
  }

  function openUploadModal(element: RoadwayElement) {
    setActiveUploadElement(element);
    setUploadForm(defaultUploadFormState);
    setMessage(null);
    setErrorMessage(null);
  }

  async function handleUploadSubmit() {
    if (project === null || activeUploadElement === null) {
      return;
    }
    if (uploadForm.file === null) {
      setErrorMessage("Choose a file to continue.");
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage(null);
      const createdUpload = await createProjectUpload({
        projectId: project.id,
        dataType: "gpr",
        notes: uploadForm.notes,
        file: uploadForm.file,
        gprImportConfig: {
          fileIdentifier: activeUploadElement.label,
          channelCount: toRequiredCount(uploadForm.channel_count, "Channel count", 1),
          channelLabels: {},
          interfaceCount: toRequiredCount(
            uploadForm.interface_count,
            "Interface count",
            1,
          ),
          interfaceLabels: {},
        },
      });

      const elementLabel = activeUploadElement.label;
      setActiveUploadElement(null);

      if (
        mappingMode === "same" &&
        sharedMappingUploadId !== "" &&
        sharedMappingUploadId !== createdUpload.id
      ) {
        try {
          await applySavedMappingToUpload(sharedMappingUploadId, createdUpload.id);
          setMessage(`${elementLabel} uploaded. Shared mapping applied automatically.`);
        } catch {
          setMessage(`${elementLabel} uploaded. Set mapping and ties to continue.`);
        }
      } else {
        setMessage(`${elementLabel} uploaded. Set ties and mapping next.`);
      }

      await loadWorkspace();

      if (mappingMode === "same" && sharedMappingUploadId === "") {
        setSharedMappingUploadId(createdUpload.id);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The upload could not be created.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function openPreviewDrawer(row: (typeof gprRows)[number]) {
    if (row.latestUpload === null) {
      return;
    }

    try {
      setActivePreviewElement(row.element);
      setProcessedPreview(null);
      setIsLoadingPreview(true);
      setErrorMessage(null);
      const preview = await getEnrichedUpload(row.latestUpload.id);
      setProcessedPreview(preview);
    } catch (error) {
      if (!isMissingEnrichedResultError(error)) {
        setErrorMessage(
          error instanceof Error ? error.message : "The processed preview could not be loaded.",
        );
      }
      setProcessedPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function openTieDrawer(row: (typeof gprRows)[number]) {
    if (row.latestUpload === null) {
      return;
    }

    try {
      setActiveTieElement(row.element);
      setActiveTieUploadId(row.latestUpload.id);
      setErrorMessage(null);
      const savedTieTable = await getUploadDistanceStationTies(row.latestUpload.id);
      setTieRows(buildUploadTieRowsFromTable(savedTieTable));
    } catch (error) {
      if (isMissingUploadTieTableError(error)) {
        setTieRows(defaultTieRows);
      } else {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Upload distance/station ties could not be loaded.",
        );
      }
    }
  }

  function buildUploadTiePayload() {
    const rows = tieRows.map((row) => {
      const distance = Number.parseFloat(row.distance);
      const station = row.station.trim();
      if (!Number.isFinite(distance)) {
        throw new Error("Tie distance values must be numeric.");
      }
      if (!station) {
        throw new Error("Each tie row needs a station value.");
      }
      return { distance, station };
    });

    if (rows.length < 2) {
      throw new Error("Enter at least two upload tie rows.");
    }

    return rows;
  }

  async function handleSaveUploadTies() {
    if (!activeTieUploadId) {
      return;
    }

    try {
      setIsSavingTies(true);
      setErrorMessage(null);
      await saveUploadDistanceStationTies({
        uploadId: activeTieUploadId,
        rows: buildUploadTiePayload(),
      });
      const savedUpload = uploads.find((upload) => upload.id === activeTieUploadId) ?? null;
      setActiveTieElement(null);
      setActiveTieUploadId("");
      await loadWorkspace();

      if (savedUpload !== null && (await maybeAutoProcessUpload(savedUpload))) {
        setMessage("Ties ready. Processing started automatically.");
      } else {
        setMessage("Ties ready.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Upload distance/station ties could not be saved.",
      );
    } finally {
      setIsSavingTies(false);
    }
  }

  async function openMappingDrawer(row: (typeof gprRows)[number]) {
    if (row.latestUpload === null) {
      return;
    }

    try {
      setIsLoadingMapping(true);
      setErrorMessage(null);
      setActiveMappingElement(row.element);
      setActiveMappingUploadId(row.latestUpload.id);
      const [preview, definition, mappingState] = await Promise.all([
        getUploadPreview(row.latestUpload.id),
        getUploadMappingDefinition(row.latestUpload.id),
        getUploadMapping(row.latestUpload.id),
      ]);
      setMappingContext({ preview, definition, mappingState });
      setMappingReuseSourceId("");
    } catch (error) {
      setActiveMappingElement(null);
      setActiveMappingUploadId("");
      setMappingContext(null);
      setErrorMessage(
        error instanceof Error ? error.message : "The mapping drawer could not be opened.",
      );
    } finally {
      setIsLoadingMapping(false);
    }
  }

  function closeMappingDrawer() {
    setActiveMappingElement(null);
    setActiveMappingUploadId("");
    setMappingContext(null);
    setMappingReuseSourceId("");
  }

  function handleAssignmentChange(sourceColumn: string, canonicalField: string) {
    setMappingContext((current) => {
      if (current === null) {
        return current;
      }
      return {
        ...current,
        mappingState: {
          ...current.mappingState,
          assignments: current.mappingState.assignments.map((assignment) =>
            assignment.source_column === sourceColumn
              ? {
                  ...assignment,
                  canonical_field: canonicalField || null,
                }
              : assignment,
          ),
        },
      };
    });
  }

  function handleAddCustomField() {
    setMappingContext((current) => {
      if (
        current === null ||
        current.mappingState.custom_fields.length >= MAX_CUSTOM_FIELDS
      ) {
        return current;
      }
      return {
        ...current,
        mappingState: {
          ...current.mappingState,
          custom_fields: [
            ...current.mappingState.custom_fields,
            { source_column: null, custom_field_name: null },
          ],
        },
      };
    });
  }

  function handleCustomFieldChange(
    index: number,
    updates: Partial<CustomFieldMapping>,
  ) {
    setMappingContext((current) => {
      if (current === null) {
        return current;
      }
      return {
        ...current,
        mappingState: {
          ...current.mappingState,
          custom_fields: current.mappingState.custom_fields.map((customField, customIndex) =>
            customIndex === index ? { ...customField, ...updates } : customField,
          ),
        },
      };
    });
  }

  function handleRemoveCustomField(index: number) {
    setMappingContext((current) => {
      if (current === null) {
        return current;
      }
      return {
        ...current,
        mappingState: {
          ...current.mappingState,
          custom_fields: current.mappingState.custom_fields.filter(
            (_, customIndex) => customIndex !== index,
          ),
        },
      };
    });
  }

  async function copySavedMappingIntoDrawer(sourceUploadId: string) {
    if (!mappingContext || !activeMappingUploadId) {
      return;
    }
    const sourceMapping = await getUploadMapping(sourceUploadId);
    if (!sourceMapping.is_saved) {
      throw new Error("Choose a saved mapping source.");
    }
    setMappingContext({
      ...mappingContext,
      mappingState: {
        ...mappingContext.mappingState,
        assignments: sourceMapping.assignments.map((assignment) => ({ ...assignment })),
        custom_fields: sourceMapping.custom_fields.map((customField) => ({
          ...customField,
        })),
      },
    });
  }

  async function applySavedMappingToUpload(
    sourceUploadId: string,
    targetUploadId: string,
  ): Promise<void> {
    const sourceMapping = await getUploadMapping(sourceUploadId);
    if (!sourceMapping.is_saved) {
      throw new Error("Choose a saved mapping source.");
    }

    const savedMapping = await saveUploadMapping({
      uploadId: targetUploadId,
      assignments: sourceMapping.assignments,
      customFields: sourceMapping.custom_fields,
    });

    const validation = await validateUploadMapping({
      uploadId: targetUploadId,
      assignments: savedMapping.assignments,
      customFields: savedMapping.custom_fields,
    });
    if (!validation.is_valid) {
      throw new Error(
        validation.issues[0]?.message ?? "The reused mapping needs adjustments.",
      );
    }
  }

  async function applySharedMappingAcrossRows(sourceUploadId: string): Promise<string[]> {
    const targetUploads = gprRows
      .map((row) => row.latestUpload)
      .filter(
        (upload): upload is UploadRecord =>
          upload !== null && upload.id !== sourceUploadId,
      );

    const results = await Promise.allSettled(
      targetUploads.map(async (upload) => {
        await applySavedMappingToUpload(sourceUploadId, upload.id);
        return upload.gpr_import_config?.file_identifier ?? upload.filename;
      }),
    );

    return results
      .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
      .map((result) => result.value);
  }

  async function handleSaveMapping() {
    if (mappingContext === null || !activeMappingUploadId) {
      return;
    }

    try {
      setIsSavingMapping(true);
      setErrorMessage(null);

      const savedMapping = await saveUploadMapping({
        uploadId: activeMappingUploadId,
        assignments: mappingContext.mappingState.assignments,
        customFields: mappingContext.mappingState.custom_fields,
      });
      const validation = await validateUploadMapping({
        uploadId: activeMappingUploadId,
        assignments: savedMapping.assignments,
        customFields: savedMapping.custom_fields,
      });

      if (!validation.is_valid) {
        throw new Error(
          validation.issues[0]?.message ?? "The saved mapping still needs attention.",
        );
      }

      let mappedRows: string[] = [];
      if (mappingMode === "same") {
        setSharedMappingUploadId(activeMappingUploadId);
        mappedRows = await applySharedMappingAcrossRows(activeMappingUploadId);
      }

      closeMappingDrawer();
      await loadWorkspace();
      await queueProjectProcessingCheck();

      if (mappingMode === "same") {
        setMessage(
          mappedRows.length === 0
            ? "Mapping saved and marked as the shared setup."
            : `Mapping saved and applied across ${mappedRows.length + 1} uploaded rows.`,
        );
      } else {
        setMessage("Mapping saved.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The mapping could not be saved.",
      );
    } finally {
      setIsSavingMapping(false);
    }
  }

  async function handleReuseSharedMapping() {
    if (!activeMappingUploadId || !sharedMappingUploadId) {
      return;
    }

    try {
      setIsSavingMapping(true);
      setErrorMessage(null);
      await applySavedMappingToUpload(sharedMappingUploadId, activeMappingUploadId);
      closeMappingDrawer();
      await loadWorkspace();
      await queueProjectProcessingCheck();
      setMessage("Shared mapping applied.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The shared mapping could not be reused.",
      );
    } finally {
      setIsSavingMapping(false);
    }
  }

  function handleRemoveRow(row: (typeof gprRows)[number]) {
    if (row.latestUpload === null) {
      return;
    }
    setHiddenUploadIds((current) => [...current, row.latestUpload.id]);
    setMessage(`${row.element.label} was removed from the workspace view.`);
  }

  if (isLoading || project === null || projectSetupForm === null) {
    return <p className="empty-state">Loading project workspace...</p>;
  }

  const showProjectTies = project.linear_reference_mode === "stations_mileposts";
  const canEditMappingDirectly =
    mappingMode !== "same" ||
    sharedMappingUploadId === "" ||
    sharedMappingUploadId === activeMappingUploadId;

  return (
    <div className="workspace-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project Workspace</p>
            <h2>{project.name}</h2>
          </div>
          <div className="workspace-top-actions">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setIsSetupDrawerOpen(true)}
            >
              Edit setup
            </button>
            {showProjectTies ? (
              <button
                className="button-secondary"
                type="button"
                onClick={() => setIsProjectTieDrawerOpen(true)}
              >
                Project ties
              </button>
            ) : null}
          </div>
        </div>

        <div className="workspace-summary-grid">
          <div className="workspace-summary-item">
            <div className="table-secondary">Roadway elements</div>
            <div className="table-primary">
              {roadwayElements.map((element) => element.label).join(" | ")}
            </div>
          </div>
          <div className="workspace-summary-item">
            <div className="table-secondary">Linear referencing</div>
            <div className="table-primary">
              {formatLinearReferenceMode(project.linear_reference_mode)}
            </div>
          </div>
          <div className="workspace-summary-item">
            <div className="table-secondary">Route context</div>
            <div className="table-primary">
              {[project.route, project.roadway, project.direction]
                .filter(Boolean)
                .join(" / ") || "Not set"}
            </div>
          </div>
          {showProjectTies ? (
            <div className="workspace-summary-item">
              <div className="table-secondary">Project ties</div>
              <div className="table-primary">
                {projectTieTable === null
                  ? "Required before GPR file setup"
                  : `${projectTieTable.rows.length} tie rows ready`}
              </div>
            </div>
          ) : null}
        </div>

        <div className="module-tab-row" role="tablist" aria-label="Project modules">
          {moduleTabs.map((tab) => (
            <button
              key={tab.key}
              className={`module-tab ${activeTab === tab.key ? "module-tab-active" : ""}`}
              type="button"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {message ? <p className="message success">{message}</p> : null}
        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
      </section>

      {activeTab === "gpr" ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GPR Workflow</p>
              <h2>Simple file setup and run</h2>
            </div>
            <p className="section-copy">
              Upload each roadway file, set its ties and mapping, and let RoadViz run
              the processing in the background.
            </p>
          </div>

          {isGprWorkflowLocked ? (
            <div className="workspace-locked-panel">
              <div className="table-primary">Project ties are required first.</div>
              <p className="inline-note">
                This project uses Stations + Mileposts, so RoadViz needs project
                station to milepost ties before the GPR file workflow is available.
              </p>
              <button
                className="button-primary button-inline"
                type="button"
                onClick={() => setIsProjectTieDrawerOpen(true)}
              >
                Set project ties
              </button>
            </div>
          ) : (
            <>
              <div className="workflow-line">
                <div>
                  <div className="table-primary">Mapping Setup</div>
                  <div className="table-secondary">{describeMappingMode(mappingMode)}</div>
                  {mappingMode === "same" && sharedMappingRow !== null ? (
                    <div className="table-secondary">
                      Shared source: {sharedMappingRow.element.label} |{" "}
                      {sharedMappingRow.latestUpload?.filename}
                    </div>
                  ) : null}
                </div>
                <button
                  className="button-primary button-inline"
                  type="button"
                  onClick={() => {
                    setIsMappingModalOpen(true);
                    setMappingModalStep(mappingMode === null ? "mode" : "detail");
                  }}
                >
                  {mappingMode === null
                    ? "Choose mapping setup"
                    : "Change mapping setup"}
                </button>
              </div>

              <div className="workspace-row-list">
                {gprRows.map((row) => {
                  const rowActionsDisabled = row.isProcessing;
                  const canPreview = row.latestUpload !== null && row.workflowState.isEnriched;

                  return (
                    <article className="workspace-row" key={row.element.key}>
                      <div className="workspace-row-main">
                        <div>
                          <div className="table-primary">{row.element.label}</div>
                          <div className="table-secondary">{row.detail}</div>
                          {row.latestUpload !== null ? (
                            <div className="table-secondary">{row.latestUpload.filename}</div>
                          ) : null}
                        </div>
                        <div className="workspace-status-trail">
                          {row.latestUpload !== null ? (
                            <span className="status-chip status-chip-ready">File ready</span>
                          ) : null}
                          {row.workflowState.hasSavedMapping &&
                          row.workflowState.mappingIsValid ? (
                            <span className="status-chip status-chip-ready">Mapping ready</span>
                          ) : null}
                          {row.workflowState.hasUploadTies ? (
                            <span className="status-chip status-chip-ready">Ties ready</span>
                          ) : null}
                          <span className="status-pill">{row.statusLabel}</span>
                        </div>
                      </div>

                      {row.isProcessing ? (
                        <div className="workspace-progress" aria-label="Processing">
                          <div className="workspace-progress-bar" />
                        </div>
                      ) : null}

                      <div className="workspace-row-actions">
                        <button
                          className="button-primary button-inline"
                          type="button"
                          onClick={() => openUploadModal(row.element)}
                          disabled={rowActionsDisabled}
                        >
                          {row.latestUpload === null ? "Upload File" : "Reupload"}
                        </button>

                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() => void openPreviewDrawer(row)}
                          disabled={!canPreview || rowActionsDisabled}
                        >
                          Preview
                        </button>

                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() => {
                            if (row.latestUpload !== null) {
                              window.location.assign(
                                getUploadDownloadUrl(project.id, row.latestUpload.id),
                              );
                            }
                          }}
                          disabled={row.latestUpload === null || rowActionsDisabled}
                        >
                          Download
                        </button>

                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() => void openTieDrawer(row)}
                          disabled={row.latestUpload === null || rowActionsDisabled}
                        >
                          Set Ties
                        </button>

                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() => void openMappingDrawer(row)}
                          disabled={row.latestUpload === null || rowActionsDisabled}
                        >
                          Set Mapping
                        </button>

                        {row.latestUpload !== null ? (
                          <button
                            className="button-secondary button-inline"
                            type="button"
                            onClick={() => handleRemoveRow(row)}
                            disabled={rowActionsDisabled}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{activeTab.toUpperCase()}</p>
              <h2>Module workspace scaffold</h2>
            </div>
            <p className="section-copy">
              GPR is the active workflow right now. The remaining modules stay in a
              clean workspace shape so they can grow without crowding this setup path.
            </p>
          </div>

          <div className="module-placeholder">
            <div className="table-primary">
              {activeTab === "core"
                ? "Coring workspace scaffolded."
                : activeTab === "dcp"
                  ? "DCP workspace scaffolded."
                  : "FWD workspace scaffolded."}
            </div>
            <p className="inline-note">
              Project setup and roadway elements are already shared at the workspace
              level.
            </p>
          </div>
        </section>
      )}

      {isMappingModalOpen ? (
        <div className="workspace-modal-backdrop">
          <div className="workspace-modal">
            {mappingModalStep === "mode" ? (
              <>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Mapping Setup</p>
                    <h2>Choose the GPR mapping mode</h2>
                  </div>
                </div>
                <div className="mapping-mode-grid">
                  <button
                    className="workspace-choice"
                    type="button"
                    onClick={() => {
                      setMappingMode("same");
                      setMappingModalStep("detail");
                    }}
                  >
                    <div className="table-primary">Use same mapping for all files</div>
                    <div className="table-secondary">
                      Save one good mapping and RoadViz will reuse it across uploaded
                      GPR rows.
                    </div>
                  </button>
                  <button
                    className="workspace-choice"
                    type="button"
                    onClick={() => {
                      setMappingMode("separate");
                      setMappingModalStep("detail");
                    }}
                  >
                    <div className="table-primary">Use separate mapping per file</div>
                    <div className="table-secondary">
                      Keep mapping decisions attached to each roadway row.
                    </div>
                  </button>
                </div>
                <div className="form-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setIsMappingModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Mapping Setup</p>
                    <h2>
                      {mappingMode === "same"
                        ? "Shared mapping across files"
                        : "Mapping stays with each file"}
                    </h2>
                  </div>
                </div>

                {mappingMode === "same" ? (
                  <div className="stack-sm">
                    <p className="inline-note">
                      Pick the uploaded file that will act as the shared mapping source.
                      When you save that file's mapping, RoadViz will apply it across
                      the other uploaded GPR rows automatically.
                    </p>
                    <label className="field-full">
                      <span>Shared mapping source</span>
                      <select
                        value={sharedMappingUploadId}
                        onChange={(event) => setSharedMappingUploadId(event.target.value)}
                      >
                        <option value="">Select an uploaded GPR file</option>
                        {gprRows
                          .filter((row) => row.latestUpload !== null)
                          .map((row) => (
                            <option key={row.latestUpload!.id} value={row.latestUpload!.id}>
                              {row.element.label} | {row.latestUpload!.filename}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="inline-note">
                      You can switch back to separate mapping here whenever you need to.
                    </p>
                  </div>
                ) : (
                  <p className="inline-note">
                    Each roadway row keeps its own mapping. Use Set Mapping on any row
                    whenever its file is ready.
                  </p>
                )}

                <div className="form-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setMappingModalStep("mode")}
                  >
                    Back
                  </button>
                  <button
                    className="button-primary"
                    type="button"
                    onClick={() => setIsMappingModalOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {activeUploadElement !== null ? (
        <div className="workspace-drawer-backdrop">
          <div className="workspace-drawer">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Upload File</p>
                <h2>{activeUploadElement.label}</h2>
              </div>
            </div>

            <div className="project-form">
              <label className="field-full">
                <span>File</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm"
                  onChange={(event) =>
                    setUploadForm((current) => ({
                      ...current,
                      file: event.target.files?.[0] ?? null,
                    }))
                  }
                />
              </label>
              <label className="field-full">
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={uploadForm.notes}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setActiveUploadElement(null)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={() => void handleUploadSubmit()}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload file"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activePreviewElement !== null ? (
        <div className="workspace-drawer-backdrop">
          <div className="workspace-drawer">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Preview File</p>
                <h2>{activePreviewElement.label}</h2>
              </div>
            </div>

            {isLoadingPreview ? (
              <p className="empty-state">Loading processed preview...</p>
            ) : processedPreview === null || processedPreview.preview_rows.length === 0 ? (
              <p className="empty-state">
                Processed preview is not available yet. Finish file setup and let
                RoadViz complete the background processing first.
              </p>
            ) : (
              <div className="stack-sm">
                <div className="workspace-preview-meta">
                  <div className="table-primary">
                    Showing the first {processedPreview.preview_rows.length} processed row
                    {processedPreview.preview_rows.length === 1 ? "" : "s"}.
                  </div>
                  <div className="table-secondary">
                    Preview uses the stored processed result for this file.
                  </div>
                </div>

                <div className="table-shell">
                  <table className="projects-table workspace-preview-table">
                    <thead>
                      <tr>
                        <th>Distance</th>
                        <th>Station</th>
                        {project.linear_reference_mode === "stations_mileposts" ? (
                          <th>Milepost</th>
                        ) : null}
                        <th>Scan</th>
                        <th>Channel</th>
                        <th>Interfaces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedPreview.preview_rows.map((row) => (
                        <tr key={`processed-preview-${row.source_row_index}`}>
                          <td>{formatOptionalNumber(row.distance, 2)}</td>
                          <td>{row.derived_station}</td>
                          {project.linear_reference_mode === "stations_mileposts" ? (
                            <td>{formatOptionalNumber(row.derived_milepost, 4)}</td>
                          ) : null}
                          <td>
                            {row.normalized_row.data_type === "gpr"
                              ? formatOptionalNumber(
                                  row.normalized_row.normalized_values.scan,
                                  0,
                                )
                              : ""}
                          </td>
                          <td>
                            {row.normalized_row.data_type === "gpr"
                              ? `${row.normalized_row.normalized_values.channel_number} | ${row.normalized_row.normalized_values.channel_label}`
                              : ""}
                          </td>
                          <td>{buildInterfaceSummary(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => {
                  setActivePreviewElement(null);
                  setProcessedPreview(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTieElement !== null ? (
        <div className="workspace-drawer-backdrop">
          <div className="workspace-drawer">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Set Ties</p>
                <h2>{activeTieElement.label}</h2>
              </div>
            </div>

            <div className="table-shell">
              <table className="projects-table tie-table">
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th>Project station</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tieRows.map((row, index) => (
                    <tr key={`workspace-tie-${index}`}>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={row.distance}
                          onChange={(event) =>
                            setTieRows((current) =>
                              current.map((item, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, distance: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.station}
                          onChange={(event) =>
                            setTieRows((current) =>
                              current.map((item, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, station: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() =>
                            setTieRows((current) =>
                              current.filter((_, rowIndex) => rowIndex !== index),
                            )
                          }
                          disabled={tieRows.length <= 2}
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
                onClick={() =>
                  setTieRows((current) => [...current, { distance: "", station: "" }])
                }
              >
                Add tie row
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setActiveTieElement(null)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={() => void handleSaveUploadTies()}
                disabled={isSavingTies}
              >
                {isSavingTies ? "Saving..." : "Save ties"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeMappingElement !== null ? (
        <div className="workspace-drawer-backdrop">
          <div className="workspace-drawer">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Set Mapping</p>
                <h2>{activeMappingElement.label}</h2>
              </div>
            </div>

            {isLoadingMapping || mappingContext === null ? (
              <p className="empty-state">Loading mapping...</p>
            ) : !canEditMappingDirectly ? (
              <div className="stack-sm">
                <div className="workspace-choice">
                  <div className="table-primary">Reuse the shared mapping</div>
                  <div className="table-secondary">
                    Shared source: {sharedMappingRow?.element.label ?? "Not selected"} |{" "}
                    {sharedMappingRow?.latestUpload?.filename ?? "No uploaded file"}
                  </div>
                </div>
                <p className="inline-note">
                  This row is using the shared mapping setup. Apply the saved shared
                  mapping here, or change the mapping setup if you want separate
                  mappings again.
                </p>
                <div className="form-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => {
                      closeMappingDrawer();
                      setIsMappingModalOpen(true);
                      setMappingModalStep("detail");
                    }}
                  >
                    Change mapping setup
                  </button>
                  <button
                    className="button-primary"
                    type="button"
                    onClick={() => void handleReuseSharedMapping()}
                    disabled={!sharedMappingUploadId || isSavingMapping}
                  >
                    {isSavingMapping ? "Applying..." : "Reuse shared mapping"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="stack-sm">
                  <div className="workspace-preview-meta">
                    <div className="table-primary">{mappingContext.preview.upload.filename}</div>
                    <div className="table-secondary">
                      Match each uploaded source column to the field RoadViz should use.
                    </div>
                  </div>

                  {mappingReuseCandidates.length > 0 ? (
                    <div className="workspace-utility-row">
                      <label className="workspace-inline-field">
                        <span>Reuse saved mapping</span>
                        <select
                          value={mappingReuseSourceId}
                          onChange={(event) => setMappingReuseSourceId(event.target.value)}
                        >
                          <option value="">Choose a saved mapping</option>
                          {mappingReuseCandidates.map((row) => (
                            <option key={row.latestUpload!.id} value={row.latestUpload!.id}>
                              {row.element.label} | {row.latestUpload!.filename}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button-secondary button-inline"
                        type="button"
                        onClick={() => void copySavedMappingIntoDrawer(mappingReuseSourceId)}
                        disabled={!mappingReuseSourceId}
                      >
                        Use as starting point
                      </button>
                    </div>
                  ) : null}

                  <div className="table-shell">
                    <table className="projects-table mapping-table">
                      <thead>
                        <tr>
                          <th>Source column</th>
                          <th>Sample value</th>
                          <th>RoadViz field</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappingContext.preview.source_columns.map((column) => {
                          const assignment =
                            mappingContext.mappingState.assignments.find(
                              (item) => item.source_column === column.name,
                            ) ?? null;
                          return (
                            <tr key={column.name}>
                              <td>{column.name}</td>
                              <td>{firstSampleValue(mappingContext.preview, column.name)}</td>
                              <td className="mapping-select-cell">
                                <select
                                  value={assignment?.canonical_field ?? ""}
                                  onChange={(event) =>
                                    handleAssignmentChange(column.name, event.target.value)
                                  }
                                >
                                  <option value="">Leave unused</option>
                                  {mappingContext.definition.canonical_fields.map((field) => (
                                    <option key={field.key} value={field.key}>
                                      {field.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <details className="workspace-disclosure">
                    <summary>Preserve extra source columns</summary>
                    <div className="stack-sm">
                      {mappingContext.mappingState.custom_fields.length === 0 ? (
                        <p className="inline-note">
                          Add a custom field only when you want to keep an extra source
                          column for later use.
                        </p>
                      ) : (
                        <div className="table-shell">
                          <table className="projects-table custom-fields-table">
                            <thead>
                              <tr>
                                <th>Source column</th>
                                <th>Saved field name</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mappingContext.mappingState.custom_fields.map(
                                (customField, index) => (
                                  <tr key={`custom-field-${index}`}>
                                    <td className="mapping-select-cell">
                                      <select
                                        value={customField.source_column ?? ""}
                                        onChange={(event) =>
                                          handleCustomFieldChange(index, {
                                            source_column: event.target.value || null,
                                          })
                                        }
                                      >
                                        <option value="">Select source column</option>
                                        {mappingContext.preview.source_columns.map((column) => (
                                          <option key={column.name} value={column.name}>
                                            {column.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="custom-field-name-cell">
                                      <input
                                        type="text"
                                        value={customField.custom_field_name ?? ""}
                                        onChange={(event) =>
                                          handleCustomFieldChange(index, {
                                            custom_field_name: event.target.value || null,
                                          })
                                        }
                                        placeholder="Display name"
                                      />
                                    </td>
                                    <td>
                                      <button
                                        className="button-secondary button-inline"
                                        type="button"
                                        onClick={() => handleRemoveCustomField(index)}
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <button
                        className="button-secondary button-inline"
                        type="button"
                        onClick={handleAddCustomField}
                        disabled={
                          mappingContext.mappingState.custom_fields.length >=
                          MAX_CUSTOM_FIELDS
                        }
                      >
                        Add custom field
                      </button>
                    </div>
                  </details>
                </div>

                <div className="form-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={closeMappingDrawer}
                  >
                    Cancel
                  </button>
                  <button
                    className="button-primary"
                    type="button"
                    onClick={() => void handleSaveMapping()}
                    disabled={isSavingMapping}
                  >
                    {isSavingMapping ? "Saving..." : "Save mapping"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {isSetupDrawerOpen ? (
        <div className="workspace-drawer-backdrop">
          <div className="workspace-drawer">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Project Setup</p>
                <h2>Edit roadway setup</h2>
              </div>
            </div>

            <div className="project-form">
              <div className="form-grid">
                <label>
                  <span>Project code</span>
                  <input
                    value={projectSetupForm.project_code}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null
                          ? current
                          : { ...current, project_code: event.target.value },
                      )
                    }
                  />
                </label>
                <label>
                  <span>Name</span>
                  <input
                    value={projectSetupForm.name}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null ? current : { ...current, name: event.target.value },
                      )
                    }
                  />
                </label>
                <label>
                  <span>Lane count</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={projectSetupForm.lane_count}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null
                          ? current
                          : { ...current, lane_count: event.target.value },
                      )
                    }
                  />
                </label>
                <label>
                  <span>Ramp count</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={projectSetupForm.ramp_count}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null
                          ? current
                          : { ...current, ramp_count: event.target.value },
                      )
                    }
                  />
                </label>
                <label>
                  <span>Outside shoulder</span>
                  <select
                    value={projectSetupForm.has_outside_shoulder ? "yes" : "no"}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null
                          ? current
                          : {
                              ...current,
                              has_outside_shoulder: event.target.value === "yes",
                            },
                      )
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label>
                  <span>Inside shoulder</span>
                  <select
                    value={projectSetupForm.has_inside_shoulder ? "yes" : "no"}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null
                          ? current
                          : {
                              ...current,
                              has_inside_shoulder: event.target.value === "yes",
                            },
                      )
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label>
                  <span>Linear referencing</span>
                  <select
                    value={projectSetupForm.linear_reference_mode}
                    onChange={(event) =>
                      setProjectSetupForm((current) =>
                        current === null
                          ? current
                          : {
                              ...current,
                              linear_reference_mode:
                                event.target.value as LinearReferenceMode,
                            },
                      )
                    }
                  >
                    <option value="stations_only">Stations only</option>
                    <option value="stations_mileposts">Stations + Mileposts</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setIsSetupDrawerOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={() => void handleSaveProjectSetup()}
                disabled={isSavingSetup}
              >
                {isSavingSetup ? "Saving..." : "Save setup"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isProjectTieDrawerOpen ? (
        <div className="workspace-drawer-backdrop">
          <div className="workspace-drawer">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Project Ties</p>
                <h2>Station to milepost</h2>
              </div>
            </div>

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
                    <tr key={`project-tie-${index}`}>
                      <td>
                        <input
                          value={row.station}
                          onChange={(event) =>
                            setProjectTieRows((current) =>
                              current.map((item, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, station: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={row.milepost}
                          onChange={(event) =>
                            setProjectTieRows((current) =>
                              current.map((item, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, milepost: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="button-secondary button-inline"
                          type="button"
                          onClick={() =>
                            setProjectTieRows((current) =>
                              current.filter((_, rowIndex) => rowIndex !== index),
                            )
                          }
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
                onClick={() =>
                  setProjectTieRows((current) => [
                    ...current,
                    { station: "", milepost: "" },
                  ])
                }
              >
                Add tie row
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setIsProjectTieDrawerOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={() => void handleSaveProjectTies()}
                disabled={isSavingProjectTies}
              >
                {isSavingProjectTies ? "Saving..." : "Save project ties"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
