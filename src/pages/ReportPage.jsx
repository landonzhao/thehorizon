import { useState, useEffect, useCallback } from "react";
import { TagList } from "../components/SourceCard.jsx";
import { CATEGORY_LABELS } from "../constants.js";
import { formatLabel, formatDate } from "../utils.js";

// ── Utility ───────────────────────────────────────────────────────────────────

function formatDateShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore", day: "2-digit", month: "short",
  });
}

function priorityClass(label) {
  return label === "critical" ? "critical" : label === "high" ? "high" : label === "medium" ? "medium" : "low";
}

// ── Primitive UI pieces ───────────────────────────────────────────────────────

function StatPill({ label, value, highlight, delta }) {
  return (
    <div className={`stat-pill${highlight ? " highlight" : ""}`}>
      <span className="stat-value">{value ?? "—"}</span>
      <span className="stat-label">{label}</span>
      {delta != null && delta !== 0 && (
        <span className={`stat-delta ${delta > 0 ? "up" : "down"}`}>
          {delta > 0 ? "+" : ""}{delta}
        </span>
      )}
    </div>
  );
}

function SectionHeader({ title, count }) {
  return (
    <div className="report-section-head">
      <h2 className="report-section-title">{title}</h2>
      {count != null && <span className="section-count">{count}</span>}
    </div>
  );
}

// ── Strategic shifts ──────────────────────────────────────────────────────────

function StrategicShifts({ shifts, comparison }) {
  if (!shifts?.length) return null;
  const delta = comparison?.delta;

  return (
    <section className="report-section report-shifts-section">
      <SectionHeader title="Strategic Shifts" count={shifts.length} />
      <div className="shifts-grid">
        {shifts.map((s, i) => (
          <div key={i} className="shift-card">
            <span className="shift-index">{String(i + 1).padStart(2, "0")}</span>
            <p className="shift-text">{s}</p>
          </div>
        ))}
      </div>
      {delta && (
        <div className="comparison-row">
          <span className="comp-label">Period vs prior:</span>
          <span className={`comp-value ${delta.source_count.change >= 0 ? "up" : "down"}`}>
            {delta.source_count.change >= 0 ? "+" : ""}{delta.source_count.change} sources
            {delta.source_count.pct_change != null && ` (${delta.source_count.pct_change > 0 ? "+" : ""}${delta.source_count.pct_change}%)`}
          </span>
          {delta.by_maturity?.emerging?.change > 0 && (
            <span className="comp-tag emerging">
              +{delta.by_maturity.emerging.change} emerging
            </span>
          )}
          {delta.new_actors?.length > 0 && (
            <span className="comp-tag">
              {delta.new_actors.length} new actor{delta.new_actors.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ── Top developments ──────────────────────────────────────────────────────────

function DevelopmentCard({ item, rank }) {
  const catLabel = CATEGORY_LABELS[item.category] || formatLabel(item.category || "");
  return (
    <article className="report-dev-card">
      <div className="report-dev-rank">#{rank}</div>
      <div className="report-dev-body">
        <p className="eyebrow">{catLabel}</p>
        <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
        <p className="meta">{item.publisher} · {formatDateShort(item.date_published)}</p>
        {item.short_summary && <p className="summary">{item.short_summary}</p>}
        {item.why_it_matters && (
          <p className="report-why"><strong>Why it matters:</strong> {item.why_it_matters}</p>
        )}
        <div className="report-dev-footer">
          <span className="score-pill">Score {item.report_score ?? "—"}</span>
          {item.priority_label && (
            <span className={`priority-pill ${priorityClass(item.priority_label)}`}>
              {formatLabel(item.priority_label)}
            </span>
          )}
          {item.tags?.slice(0, 3).map((t) => (
            <span key={t} className="tag-chip">{t.replaceAll("_", " ")}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

// ── Signal clusters ───────────────────────────────────────────────────────────

function SignalClusterCard({ cluster }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`signal-cluster${open ? " open" : ""}`}>
      <button className="cluster-header" onClick={() => setOpen((o) => !o)}>
        <span className="cluster-theme">{cluster.theme}</span>
        <div className="cluster-meta">
          {cluster.threat_maturity && (
            <span className={`maturity-tag ${cluster.threat_maturity}`}>{cluster.threat_maturity}</span>
          )}
          <span className="cluster-count">{cluster.source_count} src</span>
          <span className="cluster-rel">rel {cluster.horizon_relevance}</span>
          {cluster.categories?.length > 1 && (
            <span className="cluster-cats">{cluster.categories.length} categories</span>
          )}
          <span className="cluster-chevron">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="cluster-evidence">
          {cluster.evidence?.slice(0, 4).map((e) => (
            <div key={e.source_id} className="evidence-item">
              <a href={e.url} target="_blank" rel="noreferrer" className="evidence-title">
                {e.title}
              </a>
              <span className="evidence-pub">{e.publisher} · {e.date_published?.slice(0, 10)}</span>
              {e.signal_text && <p className="evidence-signal">"{e.signal_text}"</p>}
              {e.key_facts?.why_it_matters && (
                <p className="evidence-fact">{e.key_facts.why_it_matters}</p>
              )}
            </div>
          ))}
          {cluster.representative_signal && (
            <p className="cluster-rep-signal">Signal: {cluster.representative_signal}</p>
          )}
        </div>
      )}
    </div>
  );
}

function SignalClusters({ clusters }) {
  if (!clusters?.all_clusters?.length) return null;
  const top = clusters.all_clusters.slice(0, 10);
  return (
    <section className="report-section">
      <SectionHeader title="Signal Clusters" count={top.length} />
      <p className="section-subtitle">
        Thematically grouped intelligence signals with supporting evidence. Click to expand.
      </p>
      <div className="signal-clusters-list">
        {top.map((c) => <SignalClusterCard key={c.theme} cluster={c} />)}
      </div>
    </section>
  );
}

// ── Cross-category convergence ────────────────────────────────────────────────

function ConvergenceCard({ item }) {
  return (
    <div className="convergence-card">
      <div className="conv-header">
        <div>
          <p className="conv-theme">{item.theme}</p>
          <p className="conv-desc">{item.description}</p>
        </div>
        <div className="conv-badges">
          <span className="conv-strength" title="Convergence strength">{"●".repeat(item.strength)}{"○".repeat(5 - item.strength)}</span>
          {item.threat_maturity && (
            <span className={`maturity-tag ${item.threat_maturity}`}>{item.threat_maturity}</span>
          )}
        </div>
      </div>
      <div className="conv-cats">
        {item.category_labels?.map((l) => (
          <span key={l} className="conv-cat-tag">{l}</span>
        ))}
      </div>
      {item.evidence?.slice(0, 2).map((e) => (
        <div key={e.source_id} className="conv-evidence">
          <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>
        </div>
      ))}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function TimelineSection({ timeline }) {
  const [showAll, setShowAll] = useState(false);
  if (!timeline?.events?.length) return null;

  const events = showAll ? timeline.events : timeline.events.slice(-20);
  let lastWeek = null;

  return (
    <section className="report-section">
      <SectionHeader title="Event Timeline" count={timeline.event_count} />
      <p className="section-subtitle">
        Significant developments ordered chronologically. Showing {events.length} of {timeline.event_count}.
      </p>
      <div className="timeline-list">
        {events.map((ev) => {
          const week = Object.entries(timeline.by_week || {}).find(([, evs]) =>
            evs.some((e) => e.url === ev.url)
          )?.[0];
          const showWeekBreak = week && week !== lastWeek;
          if (showWeekBreak) lastWeek = week;

          return (
            <div key={ev.url || ev.title}>
              {showWeekBreak && (
                <div className="timeline-week-break">
                  <span>{week}</span>
                  <span className="week-count">{timeline.weekly_counts?.[week]} events</span>
                </div>
              )}
              <div className={`timeline-event priority-${priorityClass(ev.priority_label)}`}>
                <div className="tl-date">{ev.date}</div>
                <div className="tl-dot" />
                <div className="tl-body">
                  <p className="tl-cat">{ev.category_label}</p>
                  <a className="tl-title" href={ev.url} target="_blank" rel="noreferrer">{ev.title}</a>
                  <p className="tl-pub">{ev.publisher}</p>
                  {ev.short_summary && <p className="tl-summary">{ev.short_summary}</p>}
                  {ev.what_happened && <p className="tl-fact">{ev.what_happened}</p>}
                  <div className="tl-tags">
                    {ev.threat_maturity && (
                      <span className={`maturity-tag ${ev.threat_maturity}`}>{ev.threat_maturity}</span>
                    )}
                    {ev.key_entities?.cves?.slice(0, 2).map((c) => (
                      <span key={c} className="entity-tag cve">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!showAll && timeline.event_count > 20 && (
        <button className="ghost-button sm" onClick={() => setShowAll(true)}>
          Show {timeline.event_count - 20} earlier events
        </button>
      )}
    </section>
  );
}

// ── Category breakdown ────────────────────────────────────────────────────────

function CategorySection({ section, signalClusters }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? section.top_sources : section.top_sources.slice(0, 3);
  const clusters = signalClusters?.by_category?.[section.category] || [];

  return (
    <div className="report-cat-section">
      <div className="report-cat-header">
        <div>
          <p className="eyebrow">Category</p>
          <h3>{section.label}</h3>
        </div>
        <span className="report-cat-count">{section.count} sources</span>
      </div>

      {clusters.length > 0 && (
        <div className="cat-clusters">
          {clusters.slice(0, 3).map((c) => (
            <span key={c.theme} className={`cat-cluster-tag maturity-bg-${c.threat_maturity}`}>
              {c.theme} <span className="cat-cluster-n">({c.source_count})</span>
            </span>
          ))}
        </div>
      )}

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
            {s.short_summary && <p className="cat-source-summary">{s.short_summary}</p>}
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

// ── Chart bars (CSS-only, no Recharts dependency) ─────────────────────────────

function BarChart({ data, valueKey = "count", labelKey = "label", maxValue }) {
  const max = maxValue || Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="css-bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-row">
          <span className="bar-label">{d[labelKey] || d.sector || d.category}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${Math.round(((d[valueKey] || 0) / max) * 100)}%`,
                background: d.fill || "var(--accent)",
              }}
            />
          </div>
          <span className="bar-value">{d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

function RadarGrid({ data }) {
  return (
    <div className="radar-grid">
      {data.map((d) => (
        <div key={d.category} className="radar-cell" style={{ "--fill": d.fill }}>
          <div className="radar-bar" style={{ "--pct": `${Math.round((d.source_count / Math.max(...data.map(x => x.source_count), 1)) * 100)}%` }} />
          <span className="radar-label">{d.label}</span>
          <span className="radar-count">{d.source_count}</span>
        </div>
      ))}
    </div>
  );
}

function ChartSection({ chartData, stats }) {
  if (!chartData) return null;
  return (
    <section className="report-section report-charts">
      <SectionHeader title="Data Overview" />
      <div className="charts-grid">
        <div className="chart-panel">
          <p className="chart-title">Category Distribution</p>
          <RadarGrid data={chartData.radar_chart} />
        </div>
        {chartData.sector_radar?.length > 0 && (
          <div className="chart-panel">
            <p className="chart-title">Sectors Affected</p>
            <BarChart data={chartData.sector_radar} valueKey="count" labelKey="sector" />
          </div>
        )}
        <div className="chart-panel">
          <p className="chart-title">Threat Maturity</p>
          <BarChart
            data={Object.entries(stats?.threat_maturity || {})
              .filter(([, v]) => v > 0)
              .map(([k, v]) => ({
                label: k,
                count: v,
                fill: { emerging: "#f97316", growing: "#eab308", established: "#3b82f6", declining: "#6b7280" }[k] || "#e5e7eb",
              }))}
            valueKey="count"
          />
        </div>
      </div>
    </section>
  );
}

// ── Archive navigator ─────────────────────────────────────────────────────────

function ArchiveNav({ period, currentWeekKey, onSelectWeek }) {
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/generate-report?list=1&period=${period}`)
      .then((r) => r.json())
      .then((d) => { setArchives(d.reports || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  if (loading || archives.length === 0) return null;

  return (
    <div className="archive-nav">
      <span className="archive-nav-label">Past reports:</span>
      <div className="archive-nav-list">
        {archives.map((r) => (
          <button
            key={r.report_id}
            className={`archive-nav-btn${r.week_key === currentWeekKey ? " active" : ""}`}
            onClick={() => onSelectWeek(r.week_key)}
            title={`${r.date_from} → ${r.date_to} · ${r.source_count} sources`}
          >
            {r.week_key}
            {!r.is_complete && <span className="live-dot" title="In progress" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Key entities ──────────────────────────────────────────────────────────────

function KeyEntitiesSection({ entities }) {
  if (!entities) return null;
  const hasContent = entities.threat_actors?.length || entities.tools_and_techniques?.length || entities.cves?.length;
  if (!hasContent) return null;

  return (
    <section className="report-section">
      <SectionHeader title="Key Entities" />
      <div className="report-entities">
        {entities.threat_actors?.length > 0 && (
          <div className="entity-group">
            <p className="eyebrow">Threat Actors</p>
            <div className="entity-tags">
              {entities.threat_actors.map((e) => (
                <span key={e.name} className="entity-tag actor">{e.name} ({e.count})</span>
              ))}
            </div>
          </div>
        )}
        {entities.tools_and_techniques?.length > 0 && (
          <div className="entity-group">
            <p className="eyebrow">Tools & Techniques</p>
            <div className="entity-tags">
              {entities.tools_and_techniques.slice(0, 12).map((e) => (
                <span key={e.name} className="entity-tag tool">{e.name} ({e.count})</span>
              ))}
            </div>
          </div>
        )}
        {entities.cves?.length > 0 && (
          <div className="entity-group">
            <p className="eyebrow">CVEs</p>
            <div className="entity-tags">
              {entities.cves.map((c) => (
                <span key={c} className="entity-tag cve">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReportPage() {
  const [period, setPeriod] = useState("weekly");
  const [selectedWeek, setSelectedWeek] = useState(null); // null = current
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadReport = useCallback(() => {
    setReport(null);
    setError(null);
    setLoading(true);

    const url = selectedWeek
      ? `/api/generate-report?period=${period}&week=${selectedWeek}`
      : `/api/generate-report?period=${period}`;

    fetch(url)
      .then((r) => r.json())
      .then((d) => { setReport(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [period, selectedWeek]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Reset selected week when period changes
  const handlePeriodChange = (p) => {
    setPeriod(p);
    setSelectedWeek(null);
  };

  const stats = report?.statistics;
  const pc    = report?.period_comparison;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Horizon Scanning</p>
        <h1>AI Threat Intelligence Report</h1>
        {report && (
          <p className="hero-sub">
            {report.date_range?.start?.slice(0, 10)} → {report.date_range?.end?.slice(0, 10)}
            {" · "}{stats?.total_sources ?? "—"} sources · {report.week_key}
            {!report.is_complete && <span className="live-badge">Live</span>}
          </p>
        )}
        <div className="report-period-tabs">
          {["weekly", "monthly", "quarterly"].map((p) => (
            <button key={p} className={period === p ? "active" : ""} onClick={() => handlePeriodChange(p)}>
              {formatLabel(p)}
            </button>
          ))}
        </div>
      </header>

      {/* Archive navigator */}
      <div className="archive-bar">
        <ArchiveNav
          period={period}
          currentWeekKey={report?.week_key}
          onSelectWeek={(w) => setSelectedWeek(w)}
        />
      </div>

      {loading && (
        <section className="panel loading-panel">
          <div className="loading-spinner" />
          <p>Generating report…</p>
        </section>
      )}
      {error && (
        <section className="panel">
          <p style={{ color: "#f87171" }}>Error: {error}</p>
        </section>
      )}

      {report && !loading && (
        <>
          {/* Stats row */}
          <section className="report-stats-row">
            <StatPill label="Total sources" value={stats.total_sources}
              delta={pc?.delta?.source_count?.change} />
            <StatPill label="Core" value={stats.by_relevance_tier.core} highlight />
            <StatPill label="Adjacent" value={stats.by_relevance_tier.adjacent} />
            <StatPill label="Agentic AI" value={stats.by_category.agentic_ai_threats ?? 0}
              delta={pc?.delta?.by_category?.agentic_ai_threats?.change} />
            <StatPill label="LLM threats" value={stats.by_category.llm_threats ?? 0}
              delta={pc?.delta?.by_category?.llm_threats?.change} />
            <StatPill label="AI-enabled" value={stats.by_category.ai_enabled_threats ?? 0} />
            <StatPill label="Traditional ML" value={stats.by_category.traditional_ai_threats ?? 0} />
            {stats.threat_maturity.emerging > 0 && (
              <StatPill label="Emerging" value={stats.threat_maturity.emerging} highlight
                delta={pc?.delta?.by_maturity?.emerging?.change} />
            )}
            <StatPill label="Enriched" value={stats.enriched} />
          </section>

          {/* S1: Strategic shifts */}
          <StrategicShifts
            shifts={report.executive?.strategic_shifts}
            comparison={report.period_comparison}
          />

          {/* S2: Top developments */}
          {report.executive?.top_developments?.length > 0 && (
            <section className="report-section">
              <SectionHeader title="Top Developments" count={report.executive.top_developments.length} />
              <div className="report-dev-list">
                {report.executive.top_developments.slice(0, 8).map((item, i) => (
                  <DevelopmentCard key={item.url} item={item} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          {/* S3: Emerging threats */}
          {report.executive?.emerging_threats?.length > 0 && (
            <section className="report-section">
              <SectionHeader title="Emerging & Growing Threats" count={report.executive.emerging_threats.length} />
              <div className="report-dev-list">
                {report.executive.emerging_threats.map((item, i) => (
                  <DevelopmentCard key={item.url} item={item} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          {/* S4: Signal clusters */}
          <SignalClusters clusters={report.threat_landscape?.signal_clusters} />

          {/* S5: Cross-category convergence */}
          {report.threat_landscape?.convergences?.length > 0 && (
            <section className="report-section">
              <SectionHeader title="Cross-Category Convergence"
                count={report.threat_landscape.convergences.length} />
              <p className="section-subtitle">
                Threats spanning multiple categories indicate systemic or coordinated risk patterns.
              </p>
              <div className="convergence-list">
                {report.threat_landscape.convergences.map((c) => (
                  <ConvergenceCard key={c.theme} item={c} />
                ))}
              </div>
            </section>
          )}

          {/* S6: Timeline */}
          <TimelineSection timeline={report.timeline} />

          {/* S7: Charts */}
          <ChartSection chartData={report.chart_data} stats={stats} />

          {/* S8: Category breakdown */}
          <section className="report-section">
            <SectionHeader title="Category Breakdown" />
            <div className="report-categories">
              {report.category_breakdown?.map((cat) => (
                <CategorySection
                  key={cat.category}
                  section={cat}
                  signalClusters={report.threat_landscape?.signal_clusters}
                />
              ))}
            </div>
          </section>

          {/* S9: Key entities */}
          <KeyEntitiesSection entities={report.key_entities} />

          {/* Footer */}
          <p className="report-footer-note">
            {report.week_key} · Generated {new Date(report.generated_at).toLocaleString("en-SG", {
              timeZone: "Asia/Singapore",
            })} · {stats.enriched}/{stats.total_sources} sources AI-enriched
            {!report.is_complete && " · This week is still in progress"}
          </p>
        </>
      )}
    </>
  );
}
