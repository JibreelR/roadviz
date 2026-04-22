"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getUploadMapping,
  getUploadMappingDefinition,
  getNormalizedUpload,
  getUploadPreview,
  normalizeUpload,
  saveUploadMapping,
  validateUploadMapping,
  type ColumnMappingAssignment,
  type MappingDefinition,
  type MappingValidationResult,
  type NormalizedResultSet,
  type NormalizedUploadRow,
  type UploadMappingState,
  type UploadPreview,
} from "../../../../../../lib/uploads";

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatFieldBadge(value: string): string {
  return value.replaceAll("_", " ");
}

function buildConfiguredLabels(
  labels: Record<string, string>,
  count: number,
  prefix: string,
): Array<{ number: number; label: string }> {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    label: labels[String(index + 1)] ?? `${prefix} ${index + 1}`,
  }));
}

function buildAssignmentsSignature(assignments: ColumnMappingAssignment[]): string {
  return JSON.stringify(
    assignments.map((assignment) => [
      assignment.source_column,
      assignment.canonical_field,
    ]),
  );
}

function isMissingNormalizedResultError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message ===
      "Normalized results not found. Run normalization for this upload first."
  );
}

function formatOptionalValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  return String(value);
}

function buildNormalizedPreviewEntries(
  row: NormalizedUploadRow,
): Array<{ label: string; value: string }> {
  if (row.data_type === "gpr") {
    return [
      {
        label: "File identifier",
        value: row.normalized_values.file_identifier,
      },
      {
        label: "Scan",
        value: formatOptionalValue(row.normalized_values.scan),
      },
      {
        label: "Distance",
        value: formatOptionalValue(row.normalized_values.distance),
      },
      {
        label: "Channel",
        value: `${row.normalized_values.channel_number} | ${row.normalized_values.channel_label}`,
      },
      {
        label: "GPS",
        value: `${formatOptionalValue(row.normalized_values.latitude)}, ${formatOptionalValue(
          row.normalized_values.longitude,
        )}`,
      },
      {
        label: "Interfaces",
        value:
          row.normalized_values.interface_depths.length === 0
            ? "None"
            : row.normalized_values.interface_depths
                .map(
                  (item) =>
                    `${item.interface_label} (${item.interface_number}): ${formatOptionalValue(item.depth)}`,
                )
                .join(" | "),
      },
    ];
  }

  if (row.data_type === "core") {
    return [
      { label: "Core ID", value: row.normalized_values.core_id },
      { label: "Station", value: row.normalized_values.station },
      { label: "Lane", value: formatOptionalValue(row.normalized_values.lane) },
      {
        label: "Total thickness (in)",
        value: String(row.normalized_values.total_thickness_in),
      },
      {
        label: "Surface type",
        value: formatOptionalValue(row.normalized_values.surface_type),
      },
    ];
  }

  if (row.data_type === "fwd") {
    return [
      { label: "Test ID", value: row.normalized_values.test_id },
      { label: "Station", value: row.normalized_values.station },
      {
        label: "Drop load (lb)",
        value: String(row.normalized_values.drop_load_lb),
      },
      { label: "D0 (mils)", value: String(row.normalized_values.d0_mils) },
      {
        label: "Surface temp (F)",
        value: formatOptionalValue(row.normalized_values.surface_temp_f),
      },
    ];
  }

  return [
    { label: "Test point ID", value: row.normalized_values.test_point_id },
    { label: "Station", value: row.normalized_values.station },
    { label: "Blow count", value: String(row.normalized_values.blow_count) },
    { label: "Depth (mm)", value: String(row.normalized_values.depth_mm) },
    {
      label: "Layer note",
      value: formatOptionalValue(row.normalized_values.layer_note),
    },
  ];
}

export default function MappingClient({
  projectId,
  uploadId,
}: {
  projectId: string;
  uploadId: string;
}) {
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [definition, setDefinition] = useState<MappingDefinition | null>(null);
  const [mappingState, setMappingState] = useState<UploadMappingState | null>(null);
  const [validation, setValidation] = useState<MappingValidationResult | null>(null);
  const [normalizationSummary, setNormalizationSummary] =
    useState<NormalizedResultSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [normalizationError, setNormalizationError] = useState<string | null>(null);
  const [savedAssignmentsSignature, setSavedAssignmentsSignature] =
    useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadExistingNormalizationResult(): Promise<NormalizedResultSet | null> {
      try {
        return await getNormalizedUpload(uploadId, controller.signal);
      } catch (error) {
        if (isMissingNormalizedResultError(error)) {
          return null;
        }
        throw error;
      }
    }

    async function loadMappingWorkspace() {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        setNormalizationError(null);

        const [loadedPreview, loadedDefinition, loadedMapping] = await Promise.all([
          getUploadPreview(uploadId, controller.signal),
          getUploadMappingDefinition(uploadId, controller.signal),
          getUploadMapping(uploadId, controller.signal),
        ]);
        const [loadedValidation, loadedNormalizationResult] = await Promise.all([
          validateUploadMapping({
            uploadId,
            assignments: loadedMapping.assignments,
          }),
          loadExistingNormalizationResult(),
        ]);

        setPreview(loadedPreview);
        setDefinition(loadedDefinition);
        setMappingState(loadedMapping);
        setValidation(loadedValidation);
        setNormalizationSummary(loadedNormalizationResult);
        setSavedAssignmentsSignature(
          buildAssignmentsSignature(loadedMapping.assignments),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "The upload mapping workspace could not be loaded.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadMappingWorkspace();

    return () => controller.abort();
  }, [uploadId]);

  const fieldOptions = useMemo(
    () => definition?.canonical_fields ?? [],
    [definition],
  );

  const assignmentLookup = useMemo(() => {
    const nextLookup = new Map<string, ColumnMappingAssignment>();
    for (const assignment of mappingState?.assignments ?? []) {
      nextLookup.set(assignment.source_column, assignment);
    }
    return nextLookup;
  }, [mappingState]);
  const currentAssignmentsSignature = useMemo(
    () =>
      mappingState ? buildAssignmentsSignature(mappingState.assignments) : null,
    [mappingState],
  );

  const gprConfig = preview?.upload.gpr_import_config ?? null;
  const configuredChannelLabels = useMemo(
    () =>
      gprConfig
        ? buildConfiguredLabels(
            gprConfig.channel_labels,
            gprConfig.channel_count,
            "Channel",
          )
        : [],
    [gprConfig],
  );
  const configuredInterfaceLabels = useMemo(
    () =>
      gprConfig
        ? buildConfiguredLabels(
            gprConfig.interface_labels,
            gprConfig.interface_count,
            "Interface",
          )
        : [],
    [gprConfig],
  );
  const validationErrors = useMemo(
    () => validation?.issues.filter((issue) => issue.severity === "error") ?? [],
    [validation],
  );
  const validationWarnings = useMemo(
    () => validation?.issues.filter((issue) => issue.severity === "warning") ?? [],
    [validation],
  );
  const hasLatitudeMapping = useMemo(
    () =>
      mappingState?.assignments.some(
        (assignment) => assignment.canonical_field === "latitude",
      ) ?? false,
    [mappingState],
  );
  const hasLongitudeMapping = useMemo(
    () =>
      mappingState?.assignments.some(
        (assignment) => assignment.canonical_field === "longitude",
      ) ?? false,
    [mappingState],
  );
  const hasUnsavedChanges =
    currentAssignmentsSignature !== null &&
    savedAssignmentsSignature !== null &&
    currentAssignmentsSignature !== savedAssignmentsSignature;
  const isSavedForNormalization =
    mappingState?.is_saved === true && !hasUnsavedChanges;
  const hasValidMapping = validation?.is_valid === true;
  const canNormalize =
    isSavedForNormalization && hasValidMapping && !isNormalizing;
  const normalizationIssueSummary = normalizationSummary?.issue_summary ?? null;
  const normalizationErrorCount =
    normalizationIssueSummary?.error_count ?? validationErrors.length;
  const normalizationWarningCount =
    normalizationIssueSummary?.warning_count ?? validationWarnings.length;
  const normalizationIssues =
    normalizationIssueSummary === null
      ? validation?.issues ?? []
      : [
          ...normalizationIssueSummary.errors,
          ...normalizationIssueSummary.warnings,
        ];
  const normalizeButtonLabel = isNormalizing
    ? "Normalizing..."
    : normalizationSummary
      ? "Run normalization again"
      : "Normalize upload";

  function handleAssignmentChange(sourceColumn: string, canonicalField: string) {
    setMappingState((current) => {
      if (current === null) {
        return current;
      }

      return {
        ...current,
        assignments: current.assignments.map((assignment) =>
          assignment.source_column === sourceColumn
            ? {
                ...assignment,
                canonical_field: canonicalField || null,
              }
            : assignment,
          ),
      };
    });
    setSuccessMessage(null);
    setValidation(null);
    setNormalizationSummary(null);
    setNormalizationError(null);
  }

  async function handleSaveMapping() {
    if (mappingState === null) {
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setNormalizationError(null);
      const savedMapping = await saveUploadMapping({
        uploadId,
        assignments: mappingState.assignments,
      });
      const savedValidation = await validateUploadMapping({
        uploadId,
        assignments: savedMapping.assignments,
      });
      setMappingState(savedMapping);
      setSavedAssignmentsSignature(buildAssignmentsSignature(savedMapping.assignments));
      setValidation(savedValidation);
      setNormalizationSummary(null);
      setSuccessMessage(
        savedValidation.is_valid
          ? "Mapping was saved and validated. The upload is ready for normalization."
          : "Mapping was saved. Review the validation panel before normalization.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The mapping could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleValidateMapping() {
    if (mappingState === null) {
      return;
    }

    try {
      setIsValidating(true);
      setErrorMessage(null);
      setNormalizationError(null);
      const result = await validateUploadMapping({
        uploadId,
        assignments: mappingState.assignments,
      });
      setValidation(result);
      setSuccessMessage(
        result.is_valid
          ? "Mapping passed validation and is ready for normalization."
          : "Validation found issues that should be resolved before normalization.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The mapping could not be validated.",
      );
    } finally {
      setIsValidating(false);
    }
  }

  async function handleNormalizeUpload() {
    if (mappingState === null) {
      return;
    }

    if (!mappingState.is_saved || hasUnsavedChanges) {
      setNormalizationError(
        "Save the current mapping before running normalization.",
      );
      return;
    }

    if (!validation?.is_valid) {
      setNormalizationError(
        "Validation must pass before normalization can run.",
      );
      return;
    }

    try {
      setIsNormalizing(true);
      setErrorMessage(null);
      setNormalizationError(null);
      await normalizeUpload(uploadId);
      const result = await getNormalizedUpload(uploadId);
      setNormalizationSummary(result);
      setSuccessMessage(
        "Normalization completed. Review the summary and preview rows below.",
      );
    } catch (error) {
      setNormalizationError(
        error instanceof Error
          ? error.message
          : "Normalization could not be completed.",
      );
    } finally {
      setIsNormalizing(false);
    }
  }

  if (isLoading) {
    return (
      <section className="panel">
        <p className="empty-state">Loading upload preview and mapping definitions...</p>
      </section>
    );
  }

  if (preview === null || definition === null || mappingState === null) {
    return (
      <section className="panel">
        <p className="message error">
          {errorMessage ?? "The mapping workspace is not available for this upload."}
        </p>
      </section>
    );
  }

  const workflowStatus =
    normalizationSummary !== null
      ? "Normalized"
      : canNormalize
        ? "Ready to normalize"
        : hasUnsavedChanges
          ? "Save mapping changes"
          : validation === null
            ? "Validate mapping"
            : validation.is_valid
              ? "Save mapping to normalize"
              : "Resolve validation errors";
  const normalizationPreviewRows = normalizationSummary?.preview_rows ?? [];
  const showGpsGuidance =
    preview.upload.data_type === "gpr" && (!hasLatitudeMapping || !hasLongitudeMapping);
  const normalizeGuidance =
    normalizationSummary !== null
      ? `Last normalized ${formatTimestamp(normalizationSummary.normalized_at)}`
      : !mappingState.is_saved
        ? "Save the mapping before normalization."
        : hasUnsavedChanges
          ? "Save mapping updates before normalization."
          : validation?.is_valid
            ? "Validation passed. Next step: normalize this upload."
            : "Run validation and resolve any errors before normalization.";
  const validationNextStepTitle = validation?.is_valid
    ? "Next step: Normalize this upload"
    : "Next step unlocks after validation passes";
  const validationNextStepCopy = validation?.is_valid
    ? canNormalize
      ? "The saved mapping passed validation. Normalize now to store RoadViz-ready rows and review the normalized preview."
      : "Validation passed for these selections. Save the mapping to enable normalization."
    : "Resolve validation errors first. The Normalize action stays disabled until the mapping is valid.";
  const normalizedResultStatus =
    normalizationSummary === null
      ? canNormalize
        ? "Ready to run"
        : "Not run"
      : "Completed";

  return (
    <div className="stack-lg">
      <section className="panel workflow-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2>Upload to normalized rows</h2>
          </div>
          <p className="section-copy">
            Follow the steps in order so the source file moves cleanly from parsed
            columns into RoadViz-ready records.
          </p>
        </div>

        <div className="workflow-grid">
          <article className="workflow-step workflow-step-complete">
            <div className="workflow-step-number">1</div>
            <div>
              <div className="table-primary">Upload recorded</div>
              <p className="inline-note">
                The source file is stored and parsed for preview.
              </p>
            </div>
          </article>
          <article
            className={`workflow-step ${
              hasUnsavedChanges || !mappingState.is_saved
                ? "workflow-step-active"
                : "workflow-step-complete"
            }`}
          >
            <div className="workflow-step-number">2</div>
            <div>
              <div className="table-primary">Map columns</div>
              <p className="inline-note">
                Match each source column to the correct RoadViz field.
              </p>
            </div>
          </article>
          <article
            className={`workflow-step ${
              validation === null
                ? ""
                : validation.is_valid
                  ? "workflow-step-complete"
                  : "workflow-step-active"
            }`}
          >
            <div className="workflow-step-number">3</div>
            <div>
              <div className="table-primary">Validate mapping</div>
              <p className="inline-note">
                Review required fields, warnings, and GPS guidance.
              </p>
            </div>
          </article>
          <article
            className={`workflow-step ${
              normalizationSummary !== null
                ? "workflow-step-complete"
                : canNormalize
                  ? "workflow-step-active"
                  : ""
            }`}
          >
            <div className="workflow-step-number">4</div>
            <div>
              <div className="table-primary">Normalize rows</div>
              <p className="inline-note">Current status: {workflowStatus}.</p>
              <button
                className="button-secondary button-inline workflow-step-action"
                type="button"
                onClick={handleNormalizeUpload}
                disabled={!canNormalize}
              >
                {normalizeButtonLabel}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload Context</p>
            <h2>Metadata and preview summary</h2>
          </div>
          <p className="section-copy">
            Project {projectId} now has a dedicated mapping workspace for this upload.
          </p>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <div className="table-secondary">Filename</div>
            <div className="table-primary">{preview.upload.filename}</div>
          </article>
          <article className="summary-card">
            <div className="table-secondary">Data type</div>
            <div className="table-primary">{preview.upload.data_type.toUpperCase()}</div>
          </article>
          <article className="summary-card">
            <div className="table-secondary">File format</div>
            <div className="table-primary">{preview.upload.file_format.toUpperCase()}</div>
          </article>
          <article className="summary-card">
            <div className="table-secondary">Uploaded</div>
            <div className="table-primary">{formatTimestamp(preview.upload.uploaded_at)}</div>
          </article>
          <article className="summary-card">
            <div className="table-secondary">Preview mode</div>
            <div className="table-primary">{preview.preview_status}</div>
          </article>
          <article className="summary-card">
            <div className="table-secondary">Estimated rows</div>
            <div className="table-primary">
              {preview.row_count ?? preview.row_count_estimate ?? "Unknown"}
            </div>
          </article>
        </div>

        {preview.upload.notes ? (
          <p className="inline-note">Notes: {preview.upload.notes}</p>
        ) : null}

        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
        {successMessage ? <p className="message success">{successMessage}</p> : null}
      </section>

      {preview.upload.data_type === "gpr" && gprConfig ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GPR Import Setup</p>
              <h2>Upload-level GPR metadata</h2>
            </div>
            <p className="section-copy">
              This upload configuration determines which GPR fields RoadViz expects
              during mapping and how normalized rows will be labeled.
            </p>
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <div className="table-secondary">File identifier</div>
              <div className="table-primary">{gprConfig.file_identifier}</div>
            </article>
            <article className="summary-card">
              <div className="table-secondary">Channel behavior</div>
              <div className="table-primary">
                {gprConfig.channel_count === 1
                  ? "Single-channel"
                  : "Multi-channel long format"}
              </div>
            </article>
            <article className="summary-card">
              <div className="table-secondary">Channel count</div>
              <div className="table-primary">{gprConfig.channel_count}</div>
            </article>
            <article className="summary-card">
              <div className="table-secondary">Interface count</div>
              <div className="table-primary">{gprConfig.interface_count}</div>
            </article>
            <article className="summary-card">
              <div className="table-secondary">Location fields</div>
              <div className="table-primary">Scan and Distance stay separate</div>
            </article>
          </div>

          <div className="stack-sm">
            <p className="inline-note">
              Scan identifies the record position in the radar file. Distance is the
              physical position along the roadway. Map both when both are available in
              the source file.
            </p>
            {showGpsGuidance ? (
              <p className="message warning">
                GPS warning: latitude and longitude are not both mapped yet. Normalization
                can continue, but current map display will stay limited until both
                coordinates are provided.
              </p>
            ) : null}
            <div className="chip-row">
              {configuredChannelLabels.map((channel) => (
                <code key={`configured-channel-${channel.number}`}>
                  Channel {channel.number}: {channel.label}
                </code>
              ))}
            </div>
            <div className="chip-row">
              {configuredInterfaceLabels.map((item) => (
                <code key={`configured-interface-${item.number}`}>
                  Interface {item.number}: {item.label}
                </code>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Canonical Fields</p>
            <h2>RoadViz fields for {definition.data_type.toUpperCase()}</h2>
          </div>
          <p className="section-copy">
            {definition.data_type === "gpr"
              ? "For GPR, map Scan, Distance, or both when they exist. At least one of those location fields is required before normalization can proceed."
              : "Required fields must be mapped before normalization can proceed."}
          </p>
        </div>

        <div className="definition-grid">
          {definition.canonical_fields.map((field) => (
            <article className="definition-card" key={field.key}>
              <div className="template-card-header">
                <div>
                  <div className="table-primary">{field.label}</div>
                  <div className="table-secondary">{field.key}</div>
                </div>
                <div className="status-group">
                  <span className={`status-pill ${field.required ? "status-active" : ""}`}>
                    {field.required ? "Required" : "Optional"}
                  </span>
                  <span className="status-pill">{formatFieldBadge(field.category)}</span>
                </div>
              </div>
              <p className="inline-note">{field.description}</p>
              {field.example_source_headers.length > 0 ? (
                <div className="chip-row">
                  {field.example_source_headers.map((header) => (
                    <code key={header}>{header}</code>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Column Mapping</p>
            <h2>Assign each source column</h2>
          </div>
          <p className="section-copy">
            {definition.data_type === "gpr"
              ? "For GPR uploads, Scan and Distance are separate canonical fields. Map each source column independently when both exist, then validate before normalizing."
              : "Start with the required fields, then map helpful context columns as needed."}
          </p>
        </div>

        <div className="table-shell">
          <table className="projects-table mapping-table">
            <thead>
              <tr>
                <th>Source column</th>
                <th>Inferred type</th>
                <th>Sample values</th>
                <th>Canonical field</th>
              </tr>
            </thead>
            <tbody>
              {preview.source_columns.map((column) => {
                const assignment = assignmentLookup.get(column.name);

                return (
                  <tr key={column.name}>
                    <td>
                      <div className="table-primary">{column.name}</div>
                    </td>
                    <td>{column.inferred_type ?? "Unknown"}</td>
                    <td>
                      <div className="mapping-value-stack">
                        {column.sample_values.map((value, index) => (
                          <code key={`${column.name}-${index}`}>{value ?? "Empty"}</code>
                        ))}
                      </div>
                    </td>
                    <td className="mapping-select-cell">
                      <select
                        value={assignment?.canonical_field ?? ""}
                        onChange={(event) =>
                          handleAssignmentChange(column.name, event.target.value)
                        }
                      >
                        <option value="">Not mapped</option>
                        {fieldOptions.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                            {field.required ? " (required)" : ""}
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

        <div className="form-actions">
          <button
            className="button-primary"
            type="button"
            onClick={handleSaveMapping}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save mapping"}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={handleValidateMapping}
            disabled={isValidating}
          >
            {isValidating ? "Validating..." : "Validate mapping"}
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={handleNormalizeUpload}
            disabled={!canNormalize}
          >
            {normalizeButtonLabel}
          </button>
          <p className="inline-note">
            {mappingState.is_saved && mappingState.updated_at
              ? `Last saved ${formatTimestamp(mappingState.updated_at)}`
              : "This mapping has not been saved yet."}
          </p>
          <p className="inline-note">
            {canNormalize
              ? "Validation passed. Normalization is the next step."
              : hasUnsavedChanges
                ? "Current selections differ from the last saved mapping."
                : "Normalize unlocks after the saved mapping passes validation."}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Validation</p>
            <h2>Current mapping check</h2>
          </div>
          <p className="section-copy">
            {definition.data_type === "gpr"
              ? "Validation checks required fields, duplicate canonical assignments, file format consistency, whether the mapped columns exist in the parsed file, and whether at least one of Scan or Distance is mapped."
              : "Validation checks required fields, duplicate canonical assignments, file format consistency, and whether the mapped columns exist in the parsed file."}
          </p>
        </div>

        {validation === null ? (
          <p className="empty-state">
            Run validation after saving or adjusting the mapping to review issues.
          </p>
        ) : (
          <div className="stack-sm">
            <div className="summary-grid">
              <article className="summary-card">
                <div className="table-secondary">Validation status</div>
                <div className="table-primary">
                  {validation.is_valid ? "Ready for normalization" : "Action needed"}
                </div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Required fields</div>
                <div className="table-primary">
                  {validation.satisfied_required_field_count} of{" "}
                  {validation.required_field_count}
                </div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Errors</div>
                <div className="table-primary">{validationErrors.length}</div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Warnings</div>
                <div className="table-primary">{validationWarnings.length}</div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Mapped columns</div>
                <div className="table-primary">{validation.mapped_field_count}</div>
              </article>
            </div>

            <div className="validation-summary">
              <span
                className={`status-pill ${
                  validation.is_valid ? "status-active" : "status-failed"
                }`}
              >
                {validation.is_valid ? "Valid mapping" : "Validation issues found"}
              </span>
              <p className="inline-note">
                {validation.is_valid
                  ? "Save the mapping if needed, then run normalization."
                  : "Resolve errors first. Warnings can remain if they reflect known source limitations."}
              </p>
            </div>

            {validation.issues.length === 0 ? (
              <p className="message success">
                No issues found. This upload is ready for normalization.
              </p>
            ) : (
              <div className="validation-list">
                {validation.issues.map((issue) => (
                  <article
                    className={`validation-item validation-${issue.severity}`}
                    key={`${issue.code}-${issue.source_column ?? ""}-${issue.canonical_field ?? ""}`}
                  >
                    <div className="template-card-header">
                      <div className="table-primary">{issue.message}</div>
                      <span
                        className={`status-pill ${
                          issue.severity === "error" ? "status-failed" : ""
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    {(issue.source_column || issue.canonical_field) && (
                      <div className="table-secondary">
                        {[issue.source_column, issue.canonical_field]
                          .filter(Boolean)
                          .join(" | ")}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="next-step-callout">
              <div className="stack-sm">
                <div className="table-primary">{validationNextStepTitle}</div>
                <p className="inline-note">{validationNextStepCopy}</p>
              </div>
              <button
                className="button-primary"
                type="button"
                onClick={handleNormalizeUpload}
                disabled={!canNormalize}
              >
                {normalizeButtonLabel}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Normalize</p>
            <h2>Normalize and review results</h2>
          </div>
          <p className="section-copy">
            Once validation passes, normalize the upload to generate RoadViz-ready rows,
            confirm row counts, and review a compact preview of the stored result.
          </p>
        </div>

        <div className="normalization-header">
          <div className="normalization-status-card">
            <div className="table-secondary">Normalization status</div>
            <div className="table-primary">{normalizedResultStatus}</div>
            <p className="inline-note">{normalizeGuidance}</p>
          </div>
          <button
            className="button-primary"
            type="button"
            onClick={handleNormalizeUpload}
            disabled={!canNormalize}
          >
            {normalizeButtonLabel}
          </button>
        </div>

        {normalizationError ? <p className="message error">{normalizationError}</p> : null}

        {normalizationSummary === null ? (
          canNormalize ? (
            <div className="next-step-callout next-step-callout-secondary">
              <div className="stack-sm">
                <div className="table-primary">Ready to normalize</div>
                <p className="inline-note">
                  Validation passed and the saved mapping is ready. Normalize now to
                  store the result and view the normalized summary below.
                </p>
              </div>
              <button
                className="button-primary"
                type="button"
                onClick={handleNormalizeUpload}
                disabled={!canNormalize}
              >
                {normalizeButtonLabel}
              </button>
            </div>
          ) : (
            <p className="empty-state">
              No normalization results yet. Once validation passes, run normalization to
              review row counts and normalized sample rows.
            </p>
          )
        ) : (
          <div className="stack-sm">
            <div className="summary-grid">
              <article className="summary-card">
                <div className="table-secondary">Normalization status</div>
                <div className="table-primary">{normalizedResultStatus}</div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Source rows</div>
                <div className="table-primary">
                  {normalizationSummary.total_source_row_count}
                </div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Normalized rows</div>
                <div className="table-primary">
                  {normalizationSummary.normalized_row_count}
                </div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Warnings</div>
                <div className="table-primary">{normalizationWarningCount}</div>
              </article>
              <article className="summary-card">
                <div className="table-secondary">Errors</div>
                <div className="table-primary">{normalizationErrorCount}</div>
              </article>
            </div>

            {normalizationIssues.length > 0 ? (
              <div className="stack-sm">
                <div className="table-primary">Warning and error summary</div>
                <div className="validation-list">
                {normalizationIssues.map((issue) => (
                  <article
                    className={`validation-item validation-${issue.severity}`}
                    key={`normalization-issue-${issue.code}-${issue.source_column ?? ""}-${issue.canonical_field ?? ""}`}
                  >
                    <div className="template-card-header">
                      <div className="table-primary">{issue.message}</div>
                      <span
                        className={`status-pill ${
                          issue.severity === "error" ? "status-failed" : ""
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    {(issue.source_column || issue.canonical_field) && (
                      <div className="table-secondary">
                        {[issue.source_column, issue.canonical_field]
                          .filter(Boolean)
                          .join(" | ")}
                      </div>
                    )}
                  </article>
                ))}
                </div>
              </div>
            ) : (
              <p className="message success">
                No validation warnings or errors are attached to this normalized result.
              </p>
            )}

            <div className="stack-sm">
              <div className="template-card-header">
                <div>
                  <div className="table-primary">Normalized row preview</div>
                  <div className="table-secondary">
                    Showing the first {normalizationPreviewRows.length} normalized rows.
                  </div>
                </div>
              </div>

              {normalizationPreviewRows.length === 0 ? (
                <p className="empty-state">
                  Normalization completed, but no preview rows are available.
                </p>
              ) : (
                <div className="template-grid">
                  {normalizationPreviewRows.map((row) => (
                    <article className="definition-card" key={`normalized-row-${row.row_index}`}>
                      <div className="template-card-header">
                        <div>
                          <div className="table-primary">Row {row.row_index}</div>
                          <div className="table-secondary">
                            {row.data_type.toUpperCase()} normalized values
                          </div>
                        </div>
                      </div>
                      <div className="preview-key-value-grid">
                        {buildNormalizedPreviewEntries(row).map((entry) => (
                          <div className="preview-key-value" key={`${row.row_index}-${entry.label}`}>
                            <div className="table-secondary">{entry.label}</div>
                            <div className="table-primary">{entry.value}</div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sample Rows</p>
            <h2>Preview-ready structure</h2>
          </div>
          <p className="section-copy">
            These rows are parsed directly from the uploaded source file.
          </p>
        </div>

        <div className="table-shell">
          <table className="projects-table">
            <thead>
              <tr>
                {preview.source_columns.map((column) => (
                  <th key={column.name}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sample_rows.map((row, index) => (
                <tr key={`${preview.upload.id}-row-${index}`}>
                  {preview.source_columns.map((column) => (
                    <td key={`${column.name}-${index}`}>{row[column.name] ?? "Empty"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
