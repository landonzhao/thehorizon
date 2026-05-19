import { useEffect, useState } from "react";
import "./style.css";

function formatLabel(value = "") {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value) {
  if (!value) return "No date";

  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getCredibilityLabel(source) {
  return source.validity?.credibility_label || source.credibility_label || "unknown";
}

function SourceCard({ source }) {
  const credibility = getCredibilityLabel(source);

  return (
    <article className="source-card">
      <div className="source-card-header">
        <div>
          <p className="eyebrow">{formatLabel(source.source_type)}</p>
          <h2>{source.title}</h2>
        </div>

        <span className={`badge ${credibility}`}>
          {formatLabel(credibility)}
        </span>
      </div>

      <p className="meta">
        {source.publisher || "Unknown publisher"} · Published:{" "}
        {formatDate(source.date_published)}
      </p>

      <p className="summary">
        {source.full_text?.slice(0, 360) ||
          source.summary?.slice(0, 360) ||
          "No text extracted."}
      </p>

      {source.tags?.length > 0 && (
        <div className="tag-row">
          {source.tags.map((tag) => (
            <span key={tag}>{formatLabel(tag)}</span>
          ))}
        </div>
      )}

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

function SourcePage({ period }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const endpoint =
      period === "daily"
        ? "/api/sources"
        : `/api/period-sources?period=${period}`;

    fetch(endpoint)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error);
  }, [period]);

  if (!data) {
    return <section className="panel">Loading {period} sources...</section>;
  }

  const sources = data.sources || [];

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{formatLabel(period)} Intake</p>
        <h1>{formatLabel(period)} AI Threat Sources</h1>
        <p>
          Articles, reports, advisories, and research items filtered by
          publication date, not access date.
        </p>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Sources</p>
          <strong>{data.count || sources.length}</strong>
        </div>

        <div className="metric-card">
          <p>Rejected</p>
          <strong>{data.rejected_count || 0}</strong>
        </div>

        <div className="metric-card">
          <p>Discarded</p>
          <strong>{data.discarded_count || 0}</strong>
        </div>

        <div className="metric-card">
          <p>Generated</p>
          <strong>{formatDate(data.generated_at)}</strong>
        </div>
      </section>

      {(data.reporting_window || data.start) && (
          <section className="panel">
            <h2>Publication Window</h2>
            <p>
              {formatDate(data.reporting_window?.start_utc || data.start)} SGT →{" "}
              {formatDate(data.reporting_window?.end_utc || data.end)} SGT
            </p>
            <p>Filtered using source publish date.</p>
          </section>
        )}

      {data.connector_results && (
        <section className="panel">
          <h2>Connector Status</h2>

          <div className="connector-grid">
            {data.connector_results.map((connector) => (
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
        <h2>{formatLabel(period)} Articles / Reports / Advisories</h2>
        <p>These are source items only. Classification and analysis come next.</p>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No sources found</h2>
          <p>
            No source records matched this period. Check whether the database has
            sources with valid publication dates.
          </p>
        </section>
      ) : (
        <section className="source-grid">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </section>
      )}
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
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setPreset(days) {
    const end = new Date();
    const start = new Date();

    start.setDate(end.getDate() - days);

    setFilters((current) => ({
      ...current,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    }));
  }

  function clearFilters() {
    setFilters({
      start: "",
      end: "",
      publisher: "",
      source_type: "",
      tag: "",
    });
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
          Search archived sources by publication date, publisher, source type,
          and tag.
        </p>
      </header>

      <section className="panel">
        <h2>Archive Filters</h2>

        <div className="quick-filter-row">
          <button onClick={() => setPreset(7)}>Last 7 days</button>
          <button onClick={() => setPreset(30)}>Last 30 days</button>
          <button onClick={() => setPreset(90)}>Last 90 days</button>
          <button onClick={clearFilters}>Clear</button>
        </div>

        <div className="filters">
          <label>
            Published from
            <input
              type="date"
              value={filters.start}
              onChange={(e) => updateFilter("start", e.target.value)}
            />
          </label>

          <label>
            Published until
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
              <option value="security_framework">Security Framework</option>
              <option value="ai_lab_update">AI Lab Update</option>
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
        <p>Filtered by source publish date.</p>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No archived sources found</h2>
          <p>Try widening the publication date range or clearing filters.</p>
        </section>
      ) : (
        <section className="source-grid">
          {sources.map((source) => (
            <SourceCard key={`${source.snapshot_id}-${source.id}`} source={source} />
          ))}
        </section>
      )}
    </>
  );
}

export default function App() {
  const [page, setPage] = useState("daily");

  return (
    <main className="page">
      <Nav page={page} setPage={setPage} />

      {page === "daily" && <SourcePage period="daily" />}
      {page === "weekly" && <SourcePage period="weekly" />}
      {page === "monthly" && <SourcePage period="monthly" />}
      {page === "quarterly" && <SourcePage period="quarterly" />}
      {page === "archive" && <ArchivePage />}
    </main>
  );
}
