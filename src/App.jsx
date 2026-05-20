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
  const text =
      source.short_summary ||
      source.summary ||
      source.full_text ||
      "";
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

      <p className="summary">
        {text ? text.slice(0, featured ? 620 : 420) : "No summary available."}
      </p>

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
  const pages = ["report", "daily", "weekly", "monthly", "quarterly", "archive"];

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
            {item === "report" ? "Report" : formatLabel(item)}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Report Page ──────────────────────────────────────────────────────────────

const REPORT_PERIOD_DAYS = { weekly: 7, monthly: 30, quarterly: 91 };

function StatPill({ label, value, highlight }) {
  return (
    <div className={`stat-pill${highlight ? " highlight" : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function TopDevelopmentCard({ item, rank }) {
  const catLabel = CATEGORY_LABELS[item.category] || formatLabel(item.category || "");
  return (
    <article className="report-dev-card">
      <div className="report-dev-rank">#{rank}</div>
      <div className="report-dev-body">
        <p className="eyebrow">{catLabel}</p>
        <h3>
          <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
        </h3>
        <p className="meta">{item.publisher} · {formatDate(item.date_published)}</p>
        {item.short_summary && <p className="summary">{item.short_summary}</p>}
        {item.why_it_matters && (
          <p className="report-why"><strong>Why it matters:</strong> {item.why_it_matters}</p>
        )}
        <div className="report-dev-footer">
          <span className="score-pill">Score {item.report_score ?? "—"}</span>
          {item.priority_label && (
            <span className={`priority-pill ${item.priority_label}`}>
              {formatLabel(item.priority_label)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function ReportCategorySection({ section }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? section.top_sources : section.top_sources.slice(0, 3);

  return (
    <div className="report-cat-section">
      <div className="report-cat-header">
        <div>
          <p className="eyebrow">Category</p>
          <h3>{section.label}</h3>
        </div>
        <span className="report-cat-count">{section.count} sources</span>
      </div>
      <div className="report-source-list">
        {shown.map((s) => (
          <div key={s.url} className="report-source-row">
            <div className="report-source-meta">
              <span className="score-pill sm">Score {s.report_score ?? "—"}</span>
              <span className="report-date">{s.date_published?.slice(0, 10)}</span>
              <span className="report-pub">{s.publisher}</span>
            </div>
            <a className="report-source-title" href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
            {s.tags?.length > 0 && <TagList tags={s.tags} />}
          </div>
        ))}
      </div>
      {section.top_sources.length > 3 && (
        <button className="ghost-button sm" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show ${section.top_sources.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function ReportPage() {
  const [period, setPeriod] = useState("monthly");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    setLoading(true);
    fetch(`/api/generate-report?period=${period}`)
      .then((r) => r.json())
      .then((d) => { setReport(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [period]);

  const stats = report?.statistics;
  const days = REPORT_PERIOD_DAYS[period];
  const endDate = new Date().toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric" });
  const startDate = new Date(Date.now() - days * 86400000).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric" });

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Horizon Scanning</p>
        <h1>AI Threat Report</h1>
        <p>
          {startDate} → {endDate} · Structured intelligence across {stats?.total_sources ?? "—"} sources.
        </p>
        <div className="report-period-tabs">
          {["weekly", "monthly", "quarterly"].map((p) => (
            <button
              key={p}
              className={period === p ? "active" : ""}
              onClick={() => setPeriod(p)}
            >
              {formatLabel(p)}
            </button>
          ))}
        </div>
      </header>

      {loading && <section className="panel"><p>Generating report…</p></section>}
      {error && <section className="panel"><p style={{ color: "#f87171" }}>Error: {error}</p></section>}

      {report && !loading && (
        <>
          {/* Stats row */}
          <section className="report-stats-row">
            <StatPill label="Total sources" value={stats.total_sources} />
            <StatPill label="Core" value={stats.by_relevance_tier.core} highlight />
            <StatPill label="Adjacent" value={stats.by_relevance_tier.adjacent} />
            <StatPill label="LLM threats" value={stats.by_category.llm_threats ?? 0} />
            <StatPill label="Agentic AI" value={stats.by_category.agentic_ai_threats ?? 0} />
            <StatPill label="AI-enabled" value={stats.by_category.ai_enabled_threats ?? 0} />
            <StatPill label="Traditional ML" value={stats.by_category.traditional_ai_threats ?? 0} />
            {stats.threat_maturity.emerging > 0 && (
              <StatPill label="Emerging threats" value={stats.threat_maturity.emerging} highlight />
            )}
          </section>

          {/* Top developments */}
          {report.top_developments?.length > 0 && (
            <section className="report-section">
              <h2 className="report-section-title">Top Developments</h2>
              <div className="report-dev-list">
                {report.top_developments.slice(0, 8).map((item, i) => (
                  <TopDevelopmentCard key={item.url} item={item} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          {/* Emerging threats */}
          {report.emerging_threats?.length > 0 && (
            <section className="report-section">
              <h2 className="report-section-title">Emerging Threats</h2>
              <div className="report-dev-list">
                {report.emerging_threats.map((item, i) => (
                  <TopDevelopmentCard key={item.url} item={item} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          {/* Trend signals */}
          {report.trend_signals?.length > 0 && (
            <section className="report-section">
              <h2 className="report-section-title">Trend Signals</h2>
              <div className="report-signals-list">
                {report.trend_signals.map((s, i) => (
                  <div key={i} className="report-signal-row">
                    <div className="signal-dot" />
                    <div>
                      <p className="signal-text">{s.signal}</p>
                      <p className="signal-source">
                        <a href={s.source_url} target="_blank" rel="noreferrer">{s.source_title}</a>
                        {s.threat_maturity && <span className={`maturity-tag ${s.threat_maturity}`}>{s.threat_maturity}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Category breakdown */}
          <section className="report-section">
            <h2 className="report-section-title">Category Breakdown</h2>
            <div className="report-categories">
              {report.category_breakdown?.map((cat) => (
                <ReportCategorySection key={cat.category} section={cat} />
              ))}
            </div>
          </section>

          {/* Key entities */}
          {(report.key_entities?.threat_actors?.length > 0 ||
            report.key_entities?.tools_and_techniques?.length > 0) && (
            <section className="report-section">
              <h2 className="report-section-title">Key Entities</h2>
              <div className="report-entities">
                {report.key_entities.threat_actors?.length > 0 && (
                  <div className="entity-group">
                    <p className="eyebrow">Threat Actors</p>
                    <div className="entity-tags">
                      {report.key_entities.threat_actors.map((e) => (
                        <span key={e.name} className="entity-tag actor">{e.name} ({e.count})</span>
                      ))}
                    </div>
                  </div>
                )}
                {report.key_entities.tools_and_techniques?.length > 0 && (
                  <div className="entity-group">
                    <p className="eyebrow">Tools & Techniques</p>
                    <div className="entity-tags">
                      {report.key_entities.tools_and_techniques.map((e) => (
                        <span key={e.name} className="entity-tag tool">{e.name} ({e.count})</span>
                      ))}
                    </div>
                  </div>
                )}
                {report.key_entities.cves?.length > 0 && (
                  <div className="entity-group">
                    <p className="eyebrow">CVEs</p>
                    <div className="entity-tags">
                      {report.key_entities.cves.map((cve) => (
                        <span key={cve} className="entity-tag cve">{cve}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <p className="report-footer-note">
            Generated {new Date(report.generated_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })} ·{" "}
            {stats.gemini_enriched} of {stats.total_sources} sources AI-enriched ·{" "}
            Enrichment unlocks trend signals, emerging threats, and entity tracking.
          </p>
        </>
      )}
    </>
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
  const [page, setPage] = useState("report");

  return (
    <main className="page">
      <Nav page={page} setPage={setPage} />

      {page === "report" && <ReportPage />}
      {page === "daily" && <SourcePage period="daily" />}
      {page === "weekly" && <SourcePage period="weekly" />}
      {page === "monthly" && <SourcePage period="monthly" />}
      {page === "quarterly" && <SourcePage period="quarterly" />}
      {page === "archive" && <ArchivePage />}
    </main>
  );
}
