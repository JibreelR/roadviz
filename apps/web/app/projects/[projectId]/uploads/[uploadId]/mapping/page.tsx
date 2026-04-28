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
        <p className="eyebrow">Upload Details</p>
        <h1>Technical mapping, validation, normalization, and enrichment detail.</h1>
        <p className="lede">
          Use this deeper view when the project workspace needs a closer look at source
          columns, saved mappings, normalized rows, enriched rows, or analysis outputs.
        </p>
        <div className="hero-actions">
          <Link className="button-secondary" href={`/projects/${projectId}`}>
            Back to workspace
          </Link>
          <Link className="button-secondary" href={`/projects/${projectId}/uploads`}>
            Upload details
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
