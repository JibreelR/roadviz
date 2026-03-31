import Link from "next/link";

const checkpoints = [
  "Next.js frontend scaffolded",
  "FastAPI backend scaffolded",
  "PostgreSQL/PostGIS compose service defined",
  "Windows-friendly local setup documented",
  "Project CRUD foundation added",
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">RoadViz MVP</p>
        <h1>Pavement engineering workflows, starting with a clean foundation.</h1>
        <p className="lede">
          The RoadViz foundation now includes the first product object so teams can
          start organizing pavement evaluation work around real projects.
        </p>
        <div className="hero-actions">
          <Link className="button-primary" href="/projects">
            Open projects
          </Link>
        </div>
      </section>

      <section className="card-grid">
        <article className="card">
          <h2>Target stack</h2>
          <ul>
            <li>Next.js + TypeScript</li>
            <li>FastAPI + Python</li>
            <li>PostgreSQL + PostGIS</li>
            <li>Docker Compose local development</li>
          </ul>
        </article>

        <article className="card">
          <h2>Current foundation</h2>
          <ul>
            {checkpoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
