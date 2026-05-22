import { useState, useEffect, useMemo } from "react";
import { SourceCard } from "../components/SourceCard.jsx";
import { ARCHIVE_CATEGORY_ORDER, CATEGORY_LABELS, CAT_COLOURS } from "../constants.js";
import { formatLabel, sortByPriority, sortByPublishDate } from "../utils.js";

const EMPTY_FILTERS = { start: "", end: "", publisher: "", source_type: "", tag: "" };

const SOURCE_TYPES = [
  { value: "", label: "All types" },
  { value: "government_advisory",   label: "Government Advisory" },
  { value: "threat_intel",          label: "Threat Intel" },
  { value: "security_blog",         label: "Security Blog" },
  { value: "research_paper",        label: "Research Paper" },
  { value: "vulnerability_database",label: "Vulnerability Database" },
  { value: "policy_update",         label: "Policy Update" },
  { value: "ai_lab_update",         label: "AI Lab Update" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function TagCloud({ sources, activeTag, onTagClick }) {
  const tagCounts = useMemo(() => {
    const counts = {};
    for (const s of sources) {
      for (const t of (s.tags || [])) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 28);
  }, [sources]);

  if (!tagCounts.length) return null;
  const max = tagCounts[0]?.[1] || 1;

  return (
    <div className="tag-cloud-wrap">
      <p className="cloud-title">Tags in results — click to filter</p>
      <div className="tag-cloud">
        {tagCounts.map(([tag, count]) => {
          const rel = count / max;
          return (
            <button
              key={tag}
              className={`cloud-tag${activeTag === tag ? " active" : ""}`}
              style={{ fontSize: `${0.72 + rel * 0.28}rem`, opacity: 0.45 + rel * 0.55 }}
              onClick={() => onTagClick(activeTag === tag ? "" : tag)}
            >
              {formatLabel(tag)}
              <span className="cloud-n">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SourceListRow({ source }) {
  const dateStr = source.date_published
    ? new Date(source.date_published).toLocaleDateString("en-SG", {
        timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric",
      })
    : "—";

  return (
    <div className="alr">
      <span className={`priority-pill ${source.priority_label || "low"}`}>
        {source.priority_label || "—"}
      </span>
      <div className="alr-body">
        <a className="alr-title" href={source.url} target="_blank" rel="noreferrer">
          {source.title}
        </a>
        <div className="alr-meta">
          <span className="alr-pub">{source.publisher}</span>
          <span className="alr-sep">·</span>
          <span className="alr-date">{dateStr}</span>
          <span className="alr-sep">·</span>
          <span className="alr-cat">
            {CATEGORY_LABELS[source.main_category] || formatLabel(source.main_category || "")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function ArchivePage() {
  const [allSources,  setAllSources]  = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filters,     setFilters]     = useState(EMPTY_FILTERS);
  const [search,      setSearch]      = useState("");
  const [activeCat,   setActiveCat]   = useState("all");
  const [sortMode,    setSortMode]    = useState("date");
  const [viewMode,    setViewMode]    = useState("grid");
  const [activeTag,   setActiveTag]   = useState("");
  const [showFilters, setShowFilters] = useState(false);

  function updateFilter(key, val) {
    setFilters(cur => ({ ...cur, [key]: val }));
  }

  function setPreset(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFilters(cur => ({
      ...cur,
      start: start.toISOString().slice(0, 10),
      end:   end.toISOString().slice(0, 10),
    }));
  }

  function loadArchive(f = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
    fetch(`/api/archive-sources?${params}`)
      .then(r => r.json())
      .then(d => {
        setAllSources(d.sources || []);
        setActiveCat("all");
        setActiveTag("");
        setSearch("");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadArchive(); }, []);

  // Category counts from all loaded sources (not filtered)
  const catCounts = useMemo(() => {
    const counts = { all: allSources.length };
    for (const s of allSources) {
      const c = s.main_category || "uncategorised";
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [allSources]);

  // Client-side secondary filtering on top of server results
  const displayed = useMemo(() => {
    let out = allSources;
    if (activeCat !== "all") out = out.filter(s => (s.main_category || "uncategorised") === activeCat);
    if (activeTag) out = out.filter(s => (s.tags || []).includes(activeTag));
    const q = search.trim().toLowerCase();
    if (q) out = out.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.publisher?.toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
    return sortMode === "priority" ? sortByPriority(out) : sortByPublishDate(out);
  }, [allSources, activeCat, activeTag, search, sortMode]);

  const hasClientFilters = !!(search || activeCat !== "all" || activeTag);
  const activeCatsInResults = ARCHIVE_CATEGORY_ORDER.filter(c => (catCounts[c] || 0) > 0);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Archive</p>
        <h1>Source Archive</h1>
        <p>Search and browse all ingested AI threat intelligence sources.</p>
      </header>

      {/* Load panel */}
      <section className="panel arch-panel">
        <div className="arch-panel-head">
          <h2>Load Sources</h2>
          <button className="ghost-button sm" onClick={() => setShowFilters(v => !v)}>
            {showFilters ? "Hide advanced filters ↑" : "Advanced filters ↓"}
          </button>
        </div>

        <div className="quick-filter-row">
          <button onClick={() => { setPreset(7);  }}>Last 7 days</button>
          <button onClick={() => { setPreset(30); }}>Last 30 days</button>
          <button onClick={() => { setPreset(90); }}>Last 90 days</button>
          <button onClick={() => setFilters(EMPTY_FILTERS)}>All time</button>
        </div>

        {showFilters && (
          <div className="filters arch-adv-filters">
            <label>
              From
              <input type="date" value={filters.start}
                     onChange={e => updateFilter("start", e.target.value)} />
            </label>
            <label>
              Until
              <input type="date" value={filters.end}
                     onChange={e => updateFilter("end", e.target.value)} />
            </label>
            <label>
              Publisher
              <input placeholder="CISA, Microsoft, arXiv…" value={filters.publisher}
                     onChange={e => updateFilter("publisher", e.target.value)} />
            </label>
            <label>
              Source type
              <select value={filters.source_type}
                      onChange={e => updateFilter("source_type", e.target.value)}>
                {SOURCE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              Tag
              <input placeholder="prompt_injection, deepfake…" value={filters.tag}
                     onChange={e => updateFilter("tag", e.target.value)} />
            </label>
          </div>
        )}

        <button className="arch-load-btn" onClick={() => loadArchive()} disabled={loading}>
          {loading ? "Loading…" : "Load Sources"}
        </button>
      </section>

      {/* Results */}
      {allSources.length > 0 && (
        <>
          {/* Category tabs */}
          <div className="arch-cat-tabs">
            <button
              className={`act-btn${activeCat === "all" ? " active" : ""}`}
              onClick={() => setActiveCat("all")}
            >
              All <span className="act-n">{catCounts.all}</span>
            </button>
            {activeCatsInResults.map(cat => (
              <button
                key={cat}
                className={`act-btn${activeCat === cat ? " active" : ""}`}
                style={{ "--cc": CAT_COLOURS[cat] }}
                onClick={() => setActiveCat(cat)}
              >
                <span className="act-dot" style={{ background: CAT_COLOURS[cat] }} />
                {CATEGORY_LABELS[cat] || formatLabel(cat)}
                <span className="act-n">{catCounts[cat]}</span>
              </button>
            ))}
          </div>

          {/* Search + sort + view controls */}
          <div className="arch-controls">
            <input
              className="sfb-input"
              type="search"
              placeholder="Search title, publisher, tag…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="arch-sort">
              <button className={sortMode === "date"     ? "active" : ""} onClick={() => setSortMode("date")}>Date</button>
              <button className={sortMode === "priority" ? "active" : ""} onClick={() => setSortMode("priority")}>Priority</button>
            </div>
            <div className="arch-view">
              <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} title="Grid view">⊞</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} title="List view">≡</button>
            </div>
            {hasClientFilters && (
              <button className="ghost-button sm"
                      onClick={() => { setSearch(""); setActiveCat("all"); setActiveTag(""); }}>
                Clear
              </button>
            )}
          </div>

          <TagCloud sources={allSources} activeTag={activeTag} onTagClick={t => setActiveTag(t)} />

          <div className="arch-results-bar">
            <strong>{displayed.length}</strong>
            {displayed.length !== allSources.length ? ` of ${allSources.length} ` : " "}
            source{displayed.length !== 1 ? "s" : ""}
            {sortMode === "priority" ? " · sorted by priority" : " · sorted by date"}
          </div>

          {displayed.length === 0 ? (
            <section className="panel">
              <h2>No results</h2>
              <p>No sources match your current filters. Try clearing them.</p>
            </section>
          ) : viewMode === "list" ? (
            <div className="arch-list">
              {displayed.map(s => <SourceListRow key={s.id} source={s} />)}
            </div>
          ) : (
            <div className="source-grid" style={{ marginTop: "8px" }}>
              {displayed.map(s => <SourceCard key={s.id} source={s} />)}
            </div>
          )}
        </>
      )}

      {!loading && allSources.length === 0 && (
        <section className="panel">
          <h2>No sources loaded</h2>
          <p>Select a time preset or set a date range, then click Load Sources.</p>
        </section>
      )}
    </>
  );
}
