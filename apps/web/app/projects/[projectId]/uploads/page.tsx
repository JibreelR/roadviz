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
        <p className="eyebrow">Upload Details</p>
        <h1>Legacy upload intake and review for deeper technical work.</h1>
        <p className="lede">
          The main operational flow now lives in the project workspace. Keep this page
          available when you want the fuller upload intake and template view.
        </p>
        <div className="hero-actions">
          <Link className="button-secondary" href={`/projects/${projectId}`}>
            Back to workspace
          </Link>
          <Link className="button-secondary" href="/projects">
            Back to projects
          </Link>
        </div>
      </section>

      <UploadsClient initialProjectId={projectId} />
    </main>
  );
}
