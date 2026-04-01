import Link from "next/link";

import UploadsClient from "./uploads-client";

type ProjectUploadsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectUploadsPage({
  params,
}: ProjectUploadsPageProps) {
  const { projectId } = await params;

  return (
    <main className="page-shell">
      <section className="hero hero-compact">
        <p className="eyebrow">Project Uploads</p>
        <h1>Capture incoming pavement files before full parsing arrives.</h1>
        <p className="lede">
          Tie uploaded source files to a RoadViz project, mark the pavement data type,
          and review the schema templates that will guide later normalization.
        </p>
        <div className="hero-actions">
          <Link className="button-secondary" href="/projects">
            Back to projects
          </Link>
        </div>
      </section>

      <UploadsClient initialProjectId={projectId} />
    </main>
  );
}
