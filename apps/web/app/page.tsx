const checkpoints = [
  "Next.js frontend scaffolded",
  "FastAPI backend scaffolded",
  "PostgreSQL/PostGIS compose service defined",
  "Windows-friendly local setup documented",
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">RoadViz MVP</p>
        <h1>Pavement engineering workflows, starting with a clean foundation.</h1>
        <p className="lede">
          This initial scaffold sets up the web app, API, and database stack without
          adding product features yet.
        </p>
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
          <h2>Scaffold status</h2>
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
