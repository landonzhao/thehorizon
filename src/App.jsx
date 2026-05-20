import { useEffect, useState } from "react";
import "./style.css";

const MAIN_CATEGORY_ORDER = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
];

const ARCHIVE_CATEGORY_ORDER = [...MAIN_CATEGORY_ORDER, "uncategorised"];

const CATEGORY_LABELS = {
  traditional_ai_threats: "Traditional AI Threats",
  llm_threats: "LLM Threats",
  agentic_ai_threats: "Agentic AI Threats",
  ai_enabled_threats: "AI-Enabled Threats",
  ai_for_security: "AI for Security",
  uncategorised: "Needs Review",
};

const CATEGORY_DESCRIPTIONS = {
  traditional_ai_threats:
    "Threats to AI/ML models, data, training pipelines, and model supply chains.",
  llm_threats:
    "Prompt injection, jailbreaks, RAG risks, data leakage, and LLM application security.",
  agentic_ai_threats:
    "Risks from AI agents, tool use, MCP, coding agents, and autonomous workflows.",
  ai_enabled_threats:
    "AI-assisted scams, phishing, malware, deepfakes, disinformation, and fraud.",
  ai_for_security:
    "Defensive AI for detection, SOC operations, threat intelligence, and secure development.",
  uncategorised:
    "Sources that need review or do not yet fit cleanly into one category.",
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

function sortByPriority(sources = []) {
  return [...sources].sort((a, b) => {
    const scoreDiff = (b.priority_score || 0) - (a.priority_score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.date_published || 0) - new Date(a.date_published || 0);
  });
}

function sortByPublishDate(sources = []) {
  return [...sources].sort(
    (a, b) => new Date(b.date_published || 0) - new Date(a.date_published || 0)
  );
}

function groupByCategory(sources = [], mode = "priority") {
  const order = mode === "archive" ? ARCHIVE_CATEGORY_ORDER : MAIN_CATEGORY_ORDER;
  const groups = Object.fromEntries(order.map((category) => [category, []]));

  for (const source of sources) {
    const category = getCategory(source);
    const safeCategory = groups[category] ? category : "uncategorised";

    if (!groups[safeCategory]) groups[safeCategory] = [];
    groups[safeCategory].push(source);
  }

  for (const category of Object.keys(groups)) {
    groups[category] =
      mode === "archive" ? sortByPublishDate(groups[category]) : sortByPriority(groups[category]);
  }

  return groups;
}

function TagList({ tags = [] }) {
  const cleanTags = [...new Set(tags)].filter(Boolean).slice(0, 10);
  if (!cleanTags.length) return null;

  return (
    <div className="tag-row">
      {cleanTags.map((tag) => (
        <span key={tag}>{formatLabel(tag)}</span>
      ))}
    </div>
  );
}

function SourceCard({ source, featured = false }) {
  const credibility = getCredibilityLabel(source);
  const text = source.full_text || source.summary || "";
  const priorityScore = source.priority_score ?? "—";
  const priorityLabel = source.priority_label || "unscored";

  return (
    <article className={`source-card ${featured ? "featured-card" : ""}`}>
      <div className="source-card-top">
        <span className="source-type">{formatLabel(source.source_type)}</span>
        <span className={`priority-pill ${priorityLabel}`}>
          {formatLabel(priorityLabel)} · {priorityScore}
        </span>
      </div>

      <h3>{source.title}</h3>

      <p className="meta">
        {source.publisher || "Unknown publisher"} · {formatDate(source.date_published)}
      </p>

      {source.priority_reason && <p className="reason">{source.priority_reason}</p>}

      <p className="summary">{text ? text.slice(0, featured ? 520 : 340) : "No text extracted."}</p>

      <TagList tags={source.tags || []} />

      <div className="card-footer">
        <span className={`credibility ${credibility}`}>{formatLabel(credibility)}</span>
        <a href={source.url} target="_blank" rel="noreferrer">
          Open source →
        </a>
      </div>
    </article>
  );
}

function FeaturedTopThree({ sources }) {
  const topSources = sources.slice(0, 3);

  if (topSources.length === 0) {
    return (
      <div className="empty-category">
        <p>No sources in this category for this period.</p>
      </div>
    );
  }

  if (topSources.length === 1) {
    return (
      <div className="featured-layout one">
        <SourceCard source={topSources[0]} featured />
      </div>
    );
  }

  if (topSources.length === 2) {
    return (
      <div className="featured-layout two">
        <SourceCard source={topSources[0]} featured />
        <SourceCard source={topSources[1]} featured />
      </div>
    );
  }

  return (
    <div className="featured-layout three">
      <div className="featured-top">
        <SourceCard source={topSources[0]} featured />
      </div>

      <div className="featured-bottom">
        <SourceCard source={topSources[1]} />
        <SourceCard source={topSources[2]} />
      </div>
    </div>
  );
}

function CategorySection({ category, sources, onViewAll }) {
  const remaining = Math.max(0, sources.length - 3);

  return (
    <section className="category-panel">
      <div className="category-header">
        <div>
          <p className="eyebrow">Category</p>
          <h2>{CATEGORY_LABELS[category]}</h2>
          <p>{CATEGORY_DESCRIPTIONS[category]}</p>
        </div>

        <div className="category-actions">
          <div className="category-count">
            <strong>{sources.length}</strong>
            <span>sources</span>
          </div>

          <button className="ghost-button" onClick={() => onViewAll(category)}>
            View all
          </button>
        </div>
      </div>

      <FeaturedTopThree sources={sources} />

      {remaining > 0 && (
        <p className="archive-note">
          Showing top 3 by priority. {remaining} more source
          {remaining === 1 ? "" : "s"} available in this category.
        </p>
      )}
    </section>
  );
}

function CategoryDetail({ category, sources, onBack }) {
  return (
    <>
      <section className="category-panel">
        <div className="category-header">
          <div>
            <p className="eyebrow">Category Detail</p>
            <h2>{CATEGORY_LABELS[category]}</h2>
            <p>{CATEGORY_DESCRIPTIONS[category]}</p>
          </div>

          <button className="ghost-button" onClick={onBack}>
            ← Back to overview
          </button>
        </div>

        {sources.length === 0 ? (
          <div className="empty-category">
            <p>No sources in this category for this period.</p>
          </div>
        ) : (
          <div className="source-grid">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        )}
      </section>
    </>
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
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    setSelectedCategory(null);

    const endpoint =
      period === "daily" ? "/api/sources" : `/api/period-sources?period=${period}`;

    fetch(endpoint)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error);
  }, [period]);

  if (!data) return <section className="panel">Loading {period} sources...</section>;

  const sources = data.sources || [];
  const grouped = groupByCategory(sources, "priority");
  const representedCategories = MAIN_CATEGORY_ORDER.filter(
    (category) => grouped[category]?.length > 0
  ).length;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{formatLabel(period)} Intake</p>
        <h1>{formatLabel(period)} AI Threat Sources</h1>
        <p>Top sources by threat category.</p>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Total sources</p>
          <strong>{data.count || sources.length}</strong>
        </div>

        <div className="metric-card">
          <p>Categories with sources</p>
          <strong>{representedCategories}</strong>
        </div>

        <div className="metric-card wide">
          <p>Publication window</p>
          <strong>
            {formatDate(data.reporting_window?.start_utc || data.start)} SGT →{" "}
            {formatDate(data.reporting_window?.end_utc || data.end)} SGT
          </strong>
        </div>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No sources found</h2>
          <p>No source records matched this period.</p>
        </section>
      ) : selectedCategory ? (
        <CategoryDetail
          category={selectedCategory}
          sources={grouped[selectedCategory] || []}
          onBack={() => setSelectedCategory(null)}
        />
      ) : (
        MAIN_CATEGORY_ORDER.map((category) => (
          <CategorySection
            key={category}
            category={category}
            sources={grouped[category] || []}
            onViewAll={setSelectedCategory}
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
    setFilters((current) => ({ ...current, [key]: value }));
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

  const grouped = groupByCategory(sources, "archive");

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Archive</p>
        <h1>Stored Source Archive</h1>
        <p>All archived sources, grouped by category and sorted by publish date.</p>
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
        <p>Archive view is sorted by publication date, not priority score.</p>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No archived sources found</h2>
          <p>Try widening the date range or clearing filters.</p>
        </section>
      ) : (
        ARCHIVE_CATEGORY_ORDER.map((category) => {
          const categorySources = grouped[category] || [];
          if (!categorySources.length) return null;

          return (
            <section className="category-panel" key={category}>
              <div className="category-header">
                <div>
                  <p className="eyebrow">Category</p>
                  <h2>{CATEGORY_LABELS[category] || formatLabel(category)}</h2>
                  <p>{CATEGORY_DESCRIPTIONS[category]}</p>
                </div>

                <div className="category-count">
                  <strong>{categorySources.length}</strong>
                  <span>sources</span>
                </div>
              </div>

              <div className="source-grid">
                {categorySources.map((source) => (
                  <SourceCard key={`${source.snapshot_id}-${source.id}`} source={source} />
                ))}
              </div>
            </section>
          );
        })
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
