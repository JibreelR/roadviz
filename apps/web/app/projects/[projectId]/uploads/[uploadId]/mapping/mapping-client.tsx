"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getUploadMapping,
  getUploadMappingDefinition,
  getUploadPreview,
  saveUploadMapping,
  validateUploadMapping,
  type ColumnMappingAssignment,
  type MappingDefinition,
  type MappingValidationResult,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMappingWorkspace() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const loadedPreview = await getUploadPreview(uploadId, controller.signal);
        const [loadedDefinition, loadedMapping] = await Promise.all([
          getUploadMappingDefinition(uploadId, controller.signal),
          getUploadMapping(uploadId, controller.signal),
        ]);

        setPreview(loadedPreview);
        setDefinition(loadedDefinition);
        setMappingState(loadedMapping);
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
  }

  async function handleSaveMapping() {
    if (mappingState === null) {
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      const savedMapping = await saveUploadMapping({
        uploadId,
        assignments: mappingState.assignments,
      });
      setMappingState(savedMapping);
      setSuccessMessage("Mapping selections were saved for this upload.");
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

  return (
    <div className="stack-lg">
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
              This upload configuration controls the required interface and channel
              mapping fields below.
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
          </div>

          <div className="stack-sm">
            <p className="inline-note">
              Latitude and longitude are optional for import, but leaving them unmapped
              will limit current map display for this upload.
            </p>
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
              ? "For GPR uploads, Scan and Distance are separate canonical fields. Map each source column independently when both exist."
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
          <p className="inline-note">
            {mappingState.is_saved && mappingState.updated_at
              ? `Last saved ${formatTimestamp(mappingState.updated_at)}`
              : "This mapping has not been saved yet."}
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
            <div className="validation-summary">
              <span
                className={`status-pill ${
                  validation.is_valid ? "status-active" : "status-failed"
                }`}
              >
                {validation.is_valid ? "Valid mapping" : "Validation issues found"}
              </span>
              <p className="inline-note">
                Required fields satisfied: {validation.satisfied_required_field_count} of{" "}
                {validation.required_field_count}. Mapped columns: {validation.mapped_field_count}.
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
