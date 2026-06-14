"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

import { createProject, type ProjectCreateInput } from "../../../lib/projects";

type DirectionKey = "NB" | "SB" | "EB" | "WB";

type NewProjectFormState = {
  name: string;
  project_code: string;
  client_name: string;
  route_roadway: string;
  county: string;
  state: string;
  description: string;
  directions: Record<DirectionKey, boolean>;
  lane_counts: Record<DirectionKey, string>;
  has_outside_shoulder: boolean;
  has_inside_shoulder: boolean;
  ramp_count: string;
  start_location: string;
  end_location: string;
};

const directionOptions: DirectionKey[] = ["NB", "SB", "EB", "WB"];

const initialFormState: NewProjectFormState = {
  name: "",
  project_code: "",
  client_name: "",
  route_roadway: "",
  county: "",
  state: "NJ",
  description: "",
  directions: {
    NB: true,
    SB: false,
    EB: false,
    WB: false,
  },
  lane_counts: {
    NB: "1",
    SB: "1",
    EB: "1",
    WB: "1",
  },
  has_outside_shoulder: true,
  has_inside_shoulder: false,
  ramp_count: "0",
  start_location: "",
  end_location: "",
};

function toOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toRequiredCount(value: string, label: string, minimum: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${label} must be at least ${minimum}.`);
  }
  return parsed;
}

function buildProjectPayload(form: NewProjectFormState): ProjectCreateInput {
  const selectedDirections = directionOptions.filter((direction) => form.directions[direction]);
  if (selectedDirections.length === 0) {
    throw new Error("Select at least one direction.");
  }

  const totalLaneCount = selectedDirections.reduce(
    (sum, direction) =>
      sum + toRequiredCount(form.lane_counts[direction], `${direction} lane count`, 1),
    0,
  );

  return {
    project_code: form.project_code.trim(),
    name: form.name.trim(),
    lane_count: totalLaneCount,
    has_outside_shoulder: form.has_outside_shoulder,
    has_inside_shoulder: form.has_inside_shoulder,
    ramp_count: toRequiredCount(form.ramp_count, "Number of ramps", 0),
    linear_reference_mode: "stations_mileposts",
    client_name: toOptionalText(form.client_name),
    route: null,
    roadway: toOptionalText(form.route_roadway),
    direction: selectedDirections.join(" / "),
    county: toOptionalText(form.county),
    state: toOptionalText(form.state),
    start_mp: null,
    end_mp: null,
    start_station: toOptionalText(form.start_location),
    end_station: toOptionalText(form.end_location),
    description: toOptionalText(form.description),
    status: "draft",
  };
}

export default function NewProjectClient() {
  const router = useRouter();
  const [form, setForm] = useState<NewProjectFormState>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedDirections = useMemo(
    () => directionOptions.filter((direction) => form.directions[direction]),
    [form.directions],
  );

  function updateField<K extends keyof NewProjectFormState>(
    field: K,
    value: NewProjectFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleDirectionToggle(direction: DirectionKey, checked: boolean) {
    setForm((current) => ({
      ...current,
      directions: {
        ...current.directions,
        [direction]: checked,
      },
    }));
  }

  function handleLaneCountChange(direction: DirectionKey, value: string) {
    setForm((current) => ({
      ...current,
      lane_counts: {
        ...current.lane_counts,
        [direction]: value,
      },
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(() => {
      void (async () => {
        try {
          setErrorMessage(null);
          const payload = buildProjectPayload(form);
          const createdProject = await createProject(payload);
          router.push(`/projects/${createdProject.id}`);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Project could not be created.",
          );
        }
      })();
    });
  }

  return (
    <section className="new-project-shell">
      <div className="new-project-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">New Project</p>
            <h1>Create a RoadViz project</h1>
          </div>
          <p className="section-copy">
            Capture the project details first. Referencing setup and module workflows
            will continue from the project workspace.
          </p>
        </div>

        <form className="project-form" onSubmit={handleSubmit}>
          <section className="form-section">
            <div className="form-section-header">
              <h2>Project Information</h2>
            </div>
            <div className="form-grid">
              <label>
                <span>Project Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </label>
              <label>
                <span>Project Code</span>
                <input
                  required
                  value={form.project_code}
                  onChange={(event) => updateField("project_code", event.target.value)}
                />
              </label>
              <label>
                <span>Client / Owner</span>
                <input
                  value={form.client_name}
                  onChange={(event) => updateField("client_name", event.target.value)}
                />
              </label>
              <label>
                <span>Route / Roadway</span>
                <input
                  value={form.route_roadway}
                  onChange={(event) => updateField("route_roadway", event.target.value)}
                />
              </label>
              <label>
                <span>County</span>
                <input
                  value={form.county}
                  onChange={(event) => updateField("county", event.target.value)}
                />
              </label>
              <label>
                <span>State</span>
                <input
                  value={form.state}
                  onChange={(event) => updateField("state", event.target.value)}
                />
              </label>
              <label className="field-full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-header">
              <h2>Evaluation Scope</h2>
            </div>
            <div className="stack-sm">
              <div className="field-heading">Direction(s) being evaluated</div>
              <div className="direction-grid">
                {directionOptions.map((direction) => (
                  <label className="direction-card" key={direction}>
                    <div className="direction-toggle">
                      <input
                        type="checkbox"
                        checked={form.directions[direction]}
                        onChange={(event) =>
                          handleDirectionToggle(direction, event.target.checked)
                        }
                      />
                      <span>{direction}</span>
                    </div>
                    <div className="direction-lane-input">
                      <span>Lane count</span>
                      <input
                        type="number"
                        min={1}
                        value={form.lane_counts[direction]}
                        onChange={(event) =>
                          handleLaneCountChange(direction, event.target.value)
                        }
                        disabled={!form.directions[direction]}
                      />
                    </div>
                  </label>
                ))}
              </div>
              <p className="inline-note">
                Selected directions:{" "}
                {selectedDirections.length === 0 ? "None yet" : selectedDirections.join(", ")}
              </p>
            </div>

            <div className="form-grid">
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
                <span>Number of ramps</span>
                <input
                  type="number"
                  min={0}
                  value={form.ramp_count}
                  onChange={(event) => updateField("ramp_count", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-header">
              <h2>Project Limits</h2>
            </div>
            <div className="form-grid">
              <label>
                <span>Start location</span>
                <input
                  value={form.start_location}
                  onChange={(event) => updateField("start_location", event.target.value)}
                />
              </label>
              <label>
                <span>End location</span>
                <input
                  value={form.end_location}
                  onChange={(event) => updateField("end_location", event.target.value)}
                />
              </label>
            </div>
          </section>

          {errorMessage ? <p className="message error">{errorMessage}</p> : null}

          <div className="form-actions">
            <Link className="button-secondary" href="/projects">
              Cancel
            </Link>
            <button className="button-primary" type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
