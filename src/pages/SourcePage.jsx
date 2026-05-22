import { useState, useEffect, useMemo } from "react";
import { CategorySection, CategoryDetail } from "../components/CategorySection.jsx";
import { MAIN_CATEGORY_ORDER, CATEGORY_LABELS, CAT_COLOURS } from "../constants.js";
import { groupByCategory, formatLabel, formatDate, sortByPriority } from "../utils.js";

// ── Period metadata ────────────────────────────────────────────────────────────

const PERIOD_META = {
  daily:     { eyebrow: "Daily Briefing",      title: "Today's AI Threat Intelligence",          sub: "Sources published in the last 24 hours, ranked by operational priority." },
  weekly:    { eyebrow: "Weekly Digest",        title: "Weekly AI Threat Landscape",               sub: "Intelligence gathered over the past 7 days, grouped by threat category." },
  monthly:   { eyebrow: "Monthly Intelligence", title: "Monthly AI Threat Report",                 sub: "30-day view of the evolving AI threat landscape and emerging patterns." },
  quarterly: { eyebrow: "Quarterly Horizon",    title: "Quarterly Horizon Scan",                   sub: "Strategic intelligence covering 90 days of AI-enabled threats and defences." },
};

const PRIORITY_COLORS = {
  critical:   "#ef4444",
  high:       "#f97316",
  medium:     "#eab308",
  low:        "#3b82f6",
  background: "#334155",
};
const PRIORITY_ORDER = ["critical", "high", "medium", "low", "background"];

// ── Sub-components ─────────────────────────────────────────────────────────────

function PriorityBar({ sources }) {
  const total = sources.length || 1;
  const counts = PRIORITY_ORDER.reduce((a, p) => ({ ...a, [p]: 0 }), {});
  for (const s of sources) {
    const p = PRIORITY_COLORS[s.priority_label] ? s.priority_label : "background";
    counts[p]++;
  }
  const visible = PRIORITY_ORDER.filter(p => counts[p] > 0);

  return (
    <div className="pdb-wrap">
      <div className="pdb-track">
        {visible.map(p => (
          <div key={p} className="pdb-seg"
               style={{ width: `${(counts[p] / total) * 100}%`, background: PRIORITY_COLORS[p] }}
               title={`${formatLabel(p)}: ${counts[p]}`} />
        ))}
      </div>
      <div className="pdb-legend">
        {visible.map(p => (
          <span key={p} className="pdb-item">
            <span className="pdb-dot" style={{ background: PRIORITY_COLORS[p] }} />
            {formatLabel(p)} <strong>{counts[p]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function PriorityBriefing({ sources }) {
  const top = useMemo(() =>
    sortByPriority(sources)
      .filter(s => s.priority_label === "critical" || s.priority_label === "high")
      .slice(0, 5),
    [sources]
  );
  if (!top.length) return null;

  return (
    <section className="priority-briefing">
      <div className="pb-header">
        <div>
          <h2 className="pb-title">Priority Briefing</h2>
          <p className="pb-sub">Highest-priority signals across all threat categories.</p>
        </div>
        <span className="pb-count">{top.length} alert{top.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="pb-list">
        {top.map((src, i) => (
          <div key={src.id} className={`pb-row priority-${src.priority_label}`}>
            <div className="pb-rank">{i + 1}</div>
            <div className="pb-body">
              <div className="pb-meta">
                <span className={`priority-pill ${src.priority_label}`}>
                  {formatLabel(src.priority_label)} · {src.priority_score}
                </span>
                <span className="pb-cat"
                      style={{ color: CAT_COLOURS[src.main_category] || "#64748b" }}>
                  {CATEGORY_LABELS[src.main_category] || formatLabel(src.main_category || "unknown")}
                </span>
                <span className="pb-pub">{src.publisher}</span>
              </div>
              <a className="pb-title-link" href={src.url} target="_blank" rel="noreferrer">
                {src.title}
              </a>
              {(src.short_summary || src.priority_reason) && (
                <p className="pb-summary">
                  {(src.short_summary || src.priority_reason || "").slice(0, 280)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function SourcePage({ period }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [search,    setSearch]    = useState("");
  const [filterPri, setFilterPri] = useState("all");

  useEffect(() => {
    setSelected(null);
    setSearch("");
    setFilterPri("all");
    setLoading(true);
    const ep = period === "daily" ? "/api/sources" : `/api/period-sources?period=${period}`;
    fetch(ep)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const sources = data?.sources || [];

  const filtered = useMemo(() => {
    let out = sources;
    if (filterPri !== "all") out = out.filter(s => s.priority_label === filterPri);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.publisher?.toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
    return out;
  }, [sources, search, filterPri]);

  const grouped = useMemo(() => groupByCategory(filtered, "priority"), [filtered]);

  // Categories sorted by source count so busiest threat areas appear first
  const sortedCats = useMemo(() =>
    [...MAIN_CATEGORY_ORDER].sort((a, b) => (grouped[b]?.length || 0) - (grouped[a]?.length || 0)),
    [grouped]
  );
  const activeCats = sortedCats.filter(c => (grouped[c]?.length || 0) > 0);

  const critHighCount = sources.filter(s => s.priority_label === "critical" || s.priority_label === "high").length;
  const topCat = activeCats[0];
  const meta = PERIOD_META[period] || PERIOD_META.daily;
  const hasFilters = !!(search || filterPri !== "all");

  if (loading) return (
    <section className="panel loading-panel">
      <div className="loading-spinner" />
      <p>Loading {period} intelligence feed…</p>
    </section>
  );

  if (!data) return (
    <section className="panel">
      <h2>Failed to load</h2>
      <p>Could not load {period} sources. Try refreshing the page.</p>
    </section>
  );

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{meta.eyebrow}</p>
        <h1>{meta.title}</h1>
        <p>{meta.sub}</p>
        {data.reporting_window?.start_utc && (
          <p className="hero-sub">
            Coverage: {formatDate(data.reporting_window.start_utc)} → {formatDate(data.reporting_window.end_utc)} SGT
          </p>
        )}
        {sources.length > 0 && <PriorityBar sources={sources} />}
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Total sources</p>
          <strong>{sources.length}</strong>
        </div>
        <div className="metric-card">
          <p>Critical / High</p>
          <strong style={{ color: critHighCount > 0 ? "#f87171" : undefined }}>
            {critHighCount}
          </strong>
        </div>
        <div className="metric-card">
          <p>Active categories</p>
          <strong>{activeCats.length} / 5</strong>
        </div>
        <div className="metric-card">
          <p>Top category</p>
          <strong className="metric-sm"
                  style={{ color: topCat ? CAT_COLOURS[topCat] : undefined }}>
            {topCat ? CATEGORY_LABELS[topCat] : "—"}
          </strong>
        </div>
      </section>

      <PriorityBriefing sources={sources} />

      {/* Filter bar */}
      <div className="sfb">
        <input
          className="sfb-input"
          type="search"
          placeholder="Search title, publisher, tag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="sfb-pills">
          {["all", "critical", "high", "medium", "low"].map(p => (
            <button
              key={p}
              className={`sfb-pill${filterPri === p ? " active" : ""} ${p}`}
              onClick={() => setFilterPri(p)}
            >
              {p === "all" ? "All" : formatLabel(p)}
            </button>
          ))}
        </div>
        {hasFilters && (
          <>
            <button className="ghost-button sm"
                    onClick={() => { setSearch(""); setFilterPri("all"); }}>
              Clear
            </button>
            <span className="sfb-result">{filtered.length} of {sources.length}</span>
          </>
        )}
      </div>

      {/* Category quick-jump */}
      {activeCats.length > 1 && !selected && (
        <div className="cat-jump-bar">
          {activeCats.map(cat => (
            <a key={cat} className="cat-jump-btn" href={`#sp-${cat}`}
               style={{ "--cc": CAT_COLOURS[cat] }}>
              <span className="cjb-dot" />
              {CATEGORY_LABELS[cat]}
              <span className="cjb-n">{grouped[cat]?.length}</span>
            </a>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <section className="panel">
          <h2>No sources found</h2>
          <p>
            {hasFilters
              ? "No sources match your current filters. Try clearing them."
              : "No source records matched this period."}
          </p>
        </section>
      ) : selected ? (
        <CategoryDetail
          category={selected}
          sources={grouped[selected] || []}
          onBack={() => setSelected(null)}
        />
      ) : (
        activeCats.map(cat => (
          <div key={cat} id={`sp-${cat}`}>
            <CategorySection
              category={cat}
              sources={grouped[cat] || []}
              onViewAll={setSelected}
            />
          </div>
        ))
      )}
    </>
  );
}
