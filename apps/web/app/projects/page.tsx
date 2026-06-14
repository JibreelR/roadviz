import Link from "next/link";

import ProjectsClient from "./projects-client";

export default function ProjectsPage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <Link className="topbar-brand" href="/">
          RoadViz
        </Link>
        <nav className="topbar-nav" aria-label="Primary">
          <span className="topbar-link topbar-link-active">Projects</span>
        </nav>
      </header>

      <ProjectsClient />
    </main>
  );
}
