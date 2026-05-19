import { useEffect, useMemo, useState } from "react";
import "./style.css";

function formatLabel(value = "") {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value) {
  if (!value) return "No date";
  return new Date(value).toLocaleString();
}

function SourceCard({ source }) {
  return (
    <article className="source-card">
      <div className="source-card-header">
        <div>
          <p className="eyebrow">{formatLabel(source.source_type)}</p>
          <h2>{source.title}</h2>
        </div>
        <span className={`badge ${source.validity?.credibility_label || "medium_trust"}`}>
          {formatLabel(source.validity?.credibility_label || "Unknown")}
        </span>
      </div>

      <p className="meta">
        {source.publisher || "Unknown publisher"} · {formatDate(source.date_published)}
      </p>

      <p className="summary">{source.full_text?.slice(0, 360) || "No text extracted."}</p>

      <div className="tag-row">
        {(source.tags || []).map((tag) => (
          <span key={tag}>{formatLabel(tag)}</span>
        ))}
      </div>

      <a href={source.url} target="_blank" rel="noreferrer">
        Open source →
      </a>
    </article>
  );
}

function Nav({ page, setPage }) {
  const pages = ["daily", "weekly", "monthly", "quarterly", "archive"];

  return (
    <nav className="top-nav">
      <strong>The Horizon</strong>
      <div>
        {pages.map((item) => (
          <button
            key={item}
            className={page === item ? "active" : ""}
            onClick={() => setPage(item)}
          >
            {formatLabel(item)}
          </button>
        ))}
      </div>
    </nav>
  );
}

function DailyPage({ snapshot }) {
  const sources = snapshot?.sources || [];

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Daily Intake</p>
        <h1>Previous-Day AI Threat Sources</h1>
        <p>
          Cleaned, deduplicated, validity-checked source intake for the previous
          Singapore 6am–6am reporting window.
        </p>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Accepted sources</p>
          <strong>{snapshot?.count || 0}</strong>
        </div>
        <div className="metric-card">
          <p>Rejected</p>
          <strong>{snapshot?.rejected_count || 0}</strong>
        </div>
        <div className="metric-card">
          <p>Discarded</p>
          <strong>{snapshot?.discarded_count || 0}</strong>
        </div>
        <div className="metric-card">
          <p>Generated</p>
          <strong>{formatDate(snapshot?.generated_at)}</strong>
        </div>
      </section>

      {snapshot?.reporting_window && (
        <section className="panel">
          <h2>Reporting Window</h2>
          <p>
            {formatDate(snapshot.reporting_window.start_utc)} →{" "}
            {formatDate(snapshot.reporting_window.end_utc)}
          </p>
          <p>{snapshot.reporting_window.timezone}</p>
        </section>
      )}

      {snapshot?.connector_results && (
        <section className="panel">
          <h2>Connector Status</h2>
          <div className="connector-grid">
            {snapshot.connector_results.map((connector) => (
              <div className="connector-card" key={connector.connector}>
                <strong>{connector.connector}</strong>
                <span>{connector.status}</span>
                <p>{connector.count} fetched</p>
                {connector.error && <small>{connector.error}</small>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section-header">
        <h2>Chosen Articles / Reports / Advisories</h2>
        <p>These are source items only. Classification and analysis come next.</p>
      </section>

      <section className="source-grid">
        {sources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </section>
    </>
  );
}

function PeriodPage({ period, snapshots }) {
  const visibleSnapshots = useMemo(() => {
    const limits = {
      weekly: 7,
      monthly: 31,
      quarterly: 92,
    };

    const cutoff = new Date(Date.now() - limits[period] * 24 * 60 * 60 * 1000);

    return snapshots.filter((item) => new Date(item.end_utc) >= cutoff);
  }, [period, snapshots]);

  const total = visibleSnapshots.reduce((sum, item) => sum + (item.count || 0), 0);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{formatLabel(period)} Intake</p>
        <h1>{formatLabel(period)} Source Overview</h1>
        <p>
          Aggregated stored snapshots. Later this page will show trend analysis,
          category movement, and critical takeaways.
        </p>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Snapshots</p>
          <strong>{visibleSnapshots.length}</strong>
        </div>
        <div className="metric-card">
          <p>Total sources</p>
          <strong>{total}</strong>
        </div>
      </section>

      <section className="panel">
        <h2>Stored Snapshots</h2>
        <div className="snapshot-list">
          {visibleSnapshots.map((item) => (
            <div className="snapshot-pill" key={item.snapshot_id}>
              <strong>{item.snapshot_id}</strong>
              <span>{item.count} sources</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ArchivePage() {
  const [sources, setSources] = useState([]);
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    publisher: "",
    source_type: "",
    tag: "",
  });

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function loadArchive() {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    fetch(`/api/archive-sources?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSources(data.sources || []))
      .catch(console.error);
  }

  useEffect(() => {
    loadArchive();
  }, []);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Archive</p>
        <h1>Stored Source Archive</h1>
        <p>
          Search previous source snapshots by source timeframe, publisher, type,
          and tag.
        </p>
      </header>

      <section className="panel">
        <h2>Filters</h2>

        <div className="filters">
          <label>
            Start date
            <input
              type="date"
              value={filters.start}
              onChange={(e) => updateFilter("start", e.target.value)}
            />
          </label>

          <label>
            End date
            <input
              type="date"
              value={filters.end}
              onChange={(e) => updateFilter("end", e.target.value)}
            />
          </label>

          <label>
            Publisher
            <input
              placeholder="NVD, Microsoft, CISA..."
              value={filters.publisher}
              onChange={(e) => updateFilter("publisher", e.target.value)}
            />
          </label>

          <label>
            Source type
            <select
              value={filters.source_type}
              onChange={(e) => updateFilter("source_type", e.target.value)}
            >
              <option value="">All</option>
              <option value="government_advisory">Government Advisory</option>
              <option value="threat_intel">Threat Intel</option>
              <option value="security_blog">Security Blog</option>
              <option value="research_paper">Research Paper</option>
              <option value="vulnerability_database">Vulnerability Database</option>
              <option value="policy_update">Policy Update</option>
            </select>
          </label>

          <label>
            Tag
            <input
              placeholder="vulnerability, agentic_ai..."
              value={filters.tag}
              onChange={(e) => updateFilter("tag", e.target.value)}
            />
          </label>

          <button onClick={loadArchive}>Apply Filters</button>
        </div>
      </section>

      <section className="section-header">
        <h2>{sources.length} Archived Sources</h2>
        <p>Filtered across stored daily snapshots.</p>
      </section>

      <section className="source-grid">
        {sources.map((source) => (
          <SourceCard key={`${source.snapshot_id}-${source.id}`} source={source} />
        ))}
      </section>
    </>
  );
}

export default function App() {
  const [page, setPage] = useState("daily");
  const [snapshot, setSnapshot] = useState(null);
  const [snapshots, setSnapshots] = useState([]);

  useEffect(() => {
      function loadAll() {
        fetch("/api/sources")
          .then((res) => res.json())
          .then(setSnapshot)
          .catch(console.error);

        fetch("/api/snapshots")
          .then((res) => res.json())
          .then((data) => setSnapshots(data.snapshots || []))
          .catch(console.error);
      }

      loadAll();

      const interval = setInterval(loadAll, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }, []);

  if (!snapshot) return <main className="page">Loading...</main>;

  return (
    <main className="page">
      <Nav page={page} setPage={setPage} />

      {page === "daily" && <DailyPage snapshot={snapshot} />}
      {page === "weekly" && <PeriodPage period="weekly" snapshots={snapshots} />}
      {page === "monthly" && <PeriodPage period="monthly" snapshots={snapshots} />}
      {page === "quarterly" && <PeriodPage period="quarterly" snapshots={snapshots} />}
      {page === "archive" && <ArchivePage />}
    </main>
  );
}
