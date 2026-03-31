import Link from "next/link";

import ProjectsClient from "./projects-client";

export default function ProjectsPage() {
  return (
    <main className="page-shell">
      <section className="hero hero-compact">
        <p className="eyebrow">RoadViz Projects</p>
        <h1>Projects are the first real RoadViz workflow object.</h1>
        <p className="lede">
          Set up a project record, capture corridor metadata, and keep the foundation
          ready for uploads, analysis, mapping, and reporting.
        </p>
        <Link className="button-secondary" href="/">
          Back to overview
        </Link>
      </section>

      <ProjectsClient />
    </main>
  );
}
