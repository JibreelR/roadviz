import Link from "next/link";

import MappingClient from "./mapping-client";

type UploadMappingPageProps = {
  params: Promise<{
    projectId: string;
    uploadId: string;
  }>;
};

export default async function UploadMappingPage({
  params,
}: UploadMappingPageProps) {
  const { projectId, uploadId } = await params;

  return (
    <main className="page-shell">
      <section className="hero hero-compact">
        <p className="eyebrow">Upload Mapping</p>
        <h1>Preview source columns and map them into RoadViz fields.</h1>
        <p className="lede">
          This foundation keeps the mapping contract explicit so later parsing and
          normalization can build on a validated upload configuration.
        </p>
        <div className="hero-actions">
          <Link className="button-secondary" href={`/projects/${projectId}/uploads`}>
            Back to uploads
          </Link>
          <Link className="button-secondary" href="/projects">
            Projects
          </Link>
        </div>
      </section>

      <MappingClient projectId={projectId} uploadId={uploadId} />
    </main>
  );
}
