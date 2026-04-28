import Link from "next/link";

import WorkspaceClient from "./workspace-client";

type ProjectWorkspacePageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectWorkspacePage({
  params,
}: ProjectWorkspacePageProps) {
  const { projectId } = await params;

  return (
    <main className="page-shell">
      <section className="hero hero-compact">
        <p className="eyebrow">Project Workspace</p>
        <h1>One operational workspace for setup, files, ties, and processing.</h1>
        <p className="lede">
          Keep the common workflow simple on the surface and leave deeper mapping and
          data inspection behind the details routes.
        </p>
        <div className="hero-actions">
          <Link className="button-secondary" href="/projects">
            Back to projects
          </Link>
        </div>
      </section>

      <WorkspaceClient projectId={projectId} />
    </main>
  );
}
