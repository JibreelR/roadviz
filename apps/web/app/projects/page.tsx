import Link from "next/link";

import ProjectsClient from "./projects-client";

export default function ProjectsPage() {
  return (
    <main className="page-shell">
      <section className="hero hero-compact">
        <p className="eyebrow">RoadViz Projects</p>
        <h1>Projects launch the operational workspace.</h1>
        <p className="lede">
          Set up the corridor, roadway elements, and project ties here, then move into
          a single workspace for GPR and the upcoming module tabs.
        </p>
        <Link className="button-secondary" href="/">
          Back to overview
        </Link>
      </section>

      <ProjectsClient />
    </main>
  );
}
