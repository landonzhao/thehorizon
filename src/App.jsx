import { useEffect, useState } from "react";
import "./style.css";

const CATEGORY_ORDER = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
  "uncategorised",
];

const CATEGORY_LABELS = {
  traditional_ai_threats: "Security of AI — Traditional AI Threats",
  llm_threats: "Security of AI — LLM Threats",
  agentic_ai_threats: "Security of AI — Agentic AI Threats",
  ai_enabled_threats: "AI-Enabled Threats",
  ai_for_security: "AI for Security",
  uncategorised: "Uncategorised / Needs Review",
};

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

function getCategory(source) {
  return source.main_category || "uncategorised";
}

function groupByCategory(sources = []) {
  const groups = {};

  for (const category of CATEGORY_ORDER) {
    groups[category] = [];
  }

  for (const source of sources) {
    const category = getCategory(source);

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(source);
  }

  return groups;
}

function TagList({ tags = [] }) {
  if (!tags.length) return null;

  const cleanTags = [...new Set(tags)].filter(Boolean);

  return (
    <div className="tag-box">
      <p>Tags</p>
      <div className="tag-row">
        {cleanTags.map((tag) => (
          <span key={tag}>{formatLabel(tag)}</span>
        ))}
      </div>
    </div>
  );
}

function SourceCard({ source }) {
  const credibility = getCredibilityLabel(source);
  const category = getCategory(source);

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

      <div className="category-pill">
        {CATEGORY_LABELS[category] || formatLabel(category)}
      </div>

      {source.category_reason && (
        <p className="reason">
          <strong>Category reason:</strong> {source.category_reason}
        </p>
      )}

      <p className="summary">
        {source.full_text?.slice(0, 420) ||
          source.summary?.slice(0, 420) ||
          "No text extracted."}
      </p>

      <TagList tags={source.tags || []} />

      <a href={source.url} target="_blank" rel="noreferrer">
        Open source →
      </a>
    </article>
  );
}

function CategorySection({ category, sources }) {
  if (!sources.length) return null;

  return (
    <section className="category-section">
      <div className="category-header">
        <div>
          <p className="eyebrow">Category</p>
          <h2>{CATEGORY_LABELS[category] || formatLabel(category)}</h2>
        </div>
        <strong>{sources.length}</strong>
      </div>

      <div className="source-grid">
        {sources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>
    </section>
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
  const grouped = groupByCategory(sources);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{formatLabel(period)} Intake</p>
        <h1>{formatLabel(period)} AI Threat Sources</h1>
        <p>
          Articles, reports, advisories, and research items grouped by main AI
          threat category. Filtering uses publication date, not access date.
        </p>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Sources</p>
          <strong>{data.count || sources.length}</strong>
        </div>

        <div className="metric-card">
          <p>Categories represented</p>
          <strong>
            {
              Object.values(grouped).filter((items) => items.length > 0)
                .length
            }
          </strong>
        </div>

        <div className="metric-card">
          <p>Generated</p>
          <strong>{formatDate(data.generated_at)}</strong>
        </div>

        <div className="metric-card">
          <p>Mode</p>
          <strong>Published Date</strong>
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

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No sources found</h2>
          <p>
            No source records matched this period. Check whether the database has
            sources with valid publication dates and categories.
          </p>
        </section>
      ) : (
        CATEGORY_ORDER.map((category) => (
          <CategorySection
            key={category}
            category={category}
            sources={grouped[category] || []}
          />
        ))
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

  const grouped = groupByCategory(sources);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Archive</p>
        <h1>Stored Source Archive</h1>
        <p>
          Search archived sources by publication date, publisher, source type,
          and tag. Results are grouped by main category.
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
              placeholder="prompt_injection, ai_phishing..."
              value={filters.tag}
              onChange={(e) => updateFilter("tag", e.target.value)}
            />
          </label>

          <button onClick={loadArchive}>Apply Filters</button>
        </div>
      </section>

      <section className="section-header">
        <h2>{sources.length} Archived Sources</h2>
        <p>Filtered by source publish date and grouped by category.</p>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No archived sources found</h2>
          <p>Try widening the publication date range or clearing filters.</p>
        </section>
      ) : (
        CATEGORY_ORDER.map((category) => (
          <CategorySection
            key={category}
            category={category}
            sources={grouped[category] || []}
          />
        ))
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
