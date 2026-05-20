import { useState, useEffect } from "react";
import { SourceCard } from "../components/SourceCard.jsx";
import { ARCHIVE_CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from "../constants.js";
import { groupByCategory, formatLabel } from "../utils.js";

const EMPTY_FILTERS = { start: "", end: "", publisher: "", source_type: "", tag: "" };

export function ArchivePage() {
  const [sources, setSources] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

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

  function loadArchive(currentFilters = filters) {
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    fetch(`/api/archive-sources?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSources(data.sources || []))
      .catch(console.error);
  }

  useEffect(() => { loadArchive(); }, []);

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
          <button onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
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
          <button onClick={() => loadArchive()}>Apply Filters</button>
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
