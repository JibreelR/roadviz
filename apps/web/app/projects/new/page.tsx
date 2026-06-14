import Link from "next/link";

import NewProjectClient from "./new-project-client";

export default function NewProjectPage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <Link className="topbar-brand" href="/">
          RoadViz
        </Link>
        <nav className="topbar-nav" aria-label="Primary">
          <Link className="topbar-link" href="/projects">
            Projects
          </Link>
        </nav>
      </header>

      <NewProjectClient />
    </main>
  );
}
