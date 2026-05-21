import { useState, useEffect, useCallback } from "react";
import { TagList } from "../components/SourceCard.jsx";
import { CATEGORY_LABELS } from "../constants.js";
import { formatLabel } from "../utils.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const CAT_COLOURS = {
  agentic_ai_threats:     "#f97316",
  llm_threats:            "#ef4444",
  ai_enabled_threats:     "#a855f7",
  traditional_ai_threats: "#3b82f6",
  ai_for_security:        "#22c55e",
  uncategorised:          "#6b7280",
};

const MATURITY_COLOURS = {
  emerging:    "#f97316",
  growing:     "#eab308",
  established: "#3b82f6",
  declining:   "#6b7280",
};

// Pentagon node positions for the convergence graph
// Center (200,175), radius 125
const GRAPH_POS = {
  agentic_ai_threats:     { x: 200, y: 50  },  // top
  llm_threats:            { x: 319, y: 136 },  // top-right
  ai_enabled_threats:     { x: 275, y: 278 },  // bottom-right
  traditional_ai_threats: { x: 125, y: 278 },  // bottom-left
  ai_for_security:        { x:  81, y: 136 },  // top-left
};
const GRAPH_LINES = {
  agentic_ai_threats:     ["Agentic", "AI"],
  llm_threats:            ["LLM", "Threats"],
  ai_enabled_threats:     ["AI-Enabled", "Attacks"],
  traditional_ai_threats: ["Traditional", "ML"],
  ai_for_security:        ["AI", "Defence"],
};

// ── Utility helpers ────────────────────────────────────────────────────────────

function fmtDateShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore", day: "2-digit", month: "short",
  });
}

function priorityCls(label) {
  return ["critical", "high", "medium", "low"].includes(label) ? label : "low";
}

function archiveBtnLabel(r) {
  const wk = r.week_key || "";
  if (/^\d{4}-W\d{1,2}$/.test(wk)) return wk.replace(/^\d{4}-/, "");
  if (/^\d{4}-\d{2}$/.test(wk)) {
    const [y, m] = wk.split("-");
    return new Date(`${y}-${m}-01`).toLocaleDateString("en-SG", { month: "short", year: "2-digit" });
  }
  if (/^\d{4}-Q\d$/.test(wk)) return wk.replace(/^\d{4}-/, "");
  return wk;
}

// ── StatPill ──────────────────────────────────────────────────────────────────

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

// ── Strategic Shifts ──────────────────────────────────────────────────────────

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
          <span className="comp-label">vs prior period:</span>
          <span className={`comp-value ${delta.source_count?.change >= 0 ? "up" : "down"}`}>
            {delta.source_count?.change >= 0 ? "+" : ""}{delta.source_count?.change} sources
            {delta.source_count?.pct_change != null &&
              ` (${delta.source_count.pct_change > 0 ? "+" : ""}${delta.source_count.pct_change}%)`}
          </span>
          {delta.by_maturity?.emerging?.change > 0 && (
            <span className="comp-tag emerging">+{delta.by_maturity.emerging.change} emerging</span>
          )}
          {delta.new_actors?.length > 0 && (
            <span className="comp-tag">{delta.new_actors.length} new actor{delta.new_actors.length > 1 ? "s" : ""}</span>
          )}
        </div>
      )}
    </section>
  );
}

// ── Donut chart (SVG, no lib dependency) ─────────────────────────────────────

function DonutChart({ data }) {
  if (!data?.length) return null;
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (!total) return null;

  const R = 58, SW = 20, size = 180;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * R;
  const GAP = 3;

  let cumLen = 0;
  const slices = data.map((d) => {
    const len = (d.value / total) * C;
    const display = Math.max(0, len - GAP);
    const dasharray = `${display} ${C - display}`;
    const dashoffset = C - cumLen;
    cumLen += len;
    return { ...d, pct: d.value / total, dasharray, dashoffset };
  });

  return (
    <div className="donut-chart-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1e293b" strokeWidth={SW} />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {slices.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none"
              stroke={s.fill} strokeWidth={SW}
              strokeDasharray={s.dasharray} strokeDashoffset={s.dashoffset}
            >
              <title>{s.label}: {s.value} ({Math.round(s.pct * 100)}%)</title>
            </circle>
          ))}
        </g>
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize="24" fontWeight="800" fill="#f1f5f9">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#475569" letterSpacing="1">SOURCES</text>
      </svg>
      <div className="donut-legend">
        {slices.map((s) => (
          <div key={s.category} className="donut-legend-item">
            <span className="donut-legend-dot" style={{ background: s.fill }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-val">{s.value}</span>
            <span className="donut-legend-pct">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Weekly activity chart ─────────────────────────────────────────────────────

function WeeklyActivityChart({ data }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d.count || 0), 1);
  return (
    <div className="weekly-activity-chart">
      {data.map((d) => (
        <div key={d.week} className="wa-col" title={`${d.week}: ${d.count} sources, ${d.emerging_count} emerging`}>
          <div className="wa-bar-wrap">
            {d.emerging_count > 0 && (
              <div className="wa-bar emerging" style={{ height: `${Math.round((d.emerging_count / max) * 100)}%` }} />
            )}
            <div className="wa-bar base" style={{ height: `${Math.round(((d.count - (d.emerging_count || 0)) / max) * 100)}%` }} />
          </div>
          <span className="wa-label">{d.label || d.week?.replace(/^\d{4}-/, "")}</span>
          <span className="wa-count">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Maturity breakdown bar ────────────────────────────────────────────────────

function MaturityBar({ data }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => (d.emerging || 0) + (d.growing || 0) + (d.established || 0)), 1);
  return (
    <div className="maturity-stacked-bars">
      {data.filter(d => d.category !== "uncategorised").map((d) => {
        const total = (d.emerging || 0) + (d.growing || 0) + (d.established || 0) + (d.declining || 0);
        if (!total) return null;
        const color = CAT_COLOURS[d.category] || "#6b7280";
        return (
          <div key={d.category} className="maturity-row">
            <span className="maturity-cat-label" style={{ color }}>{d.label}</span>
            <div className="maturity-track">
              {["emerging", "growing", "established", "declining"].map((m) =>
                d[m] > 0 ? (
                  <div key={m} className={`maturity-seg ${m}`}
                    style={{ width: `${Math.round((d[m] / max) * 100)}%`, background: MATURITY_COLOURS[m] }}
                    title={`${m}: ${d[m]}`}
                  />
                ) : null
              )}
            </div>
            <span className="maturity-total">{total}</span>
          </div>
        );
      })}
      <div className="maturity-legend">
        {["emerging", "growing", "established", "declining"].map((m) => (
          <span key={m} className="mat-leg-item">
            <span className="mat-leg-dot" style={{ background: MATURITY_COLOURS[m] }} />{m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Tag heatmap ───────────────────────────────────────────────────────────────

function TagHeatmap({ tags }) {
  if (!tags?.length) return null;
  const max = tags[0].count;
  return (
    <div className="tag-heatmap">
      {tags.slice(0, 32).map(({ tag, count }) => {
        const pct = count / max;
        return (
          <span key={tag} className="heatmap-tag"
            style={{ fontSize: `${0.68 + pct * 0.72}rem`, opacity: 0.35 + pct * 0.65 }}
            title={`${tag}: ${count} sources`}
          >
            {tag.replaceAll("_", " ")}
            <sup className="heatmap-count">{count}</sup>
          </span>
        );
      })}
    </div>
  );
}

// ── Convergence network graph (SVG) ───────────────────────────────────────────

function ConvergenceGraph({ matrix }) {
  const [activeEdge, setActiveEdge] = useState(null);
  if (!matrix?.nodes?.length) return null;

  const edges  = matrix.edges || [];
  const maxW   = edges.length ? Math.max(...edges.map((e) => e.weight)) : 1;

  return (
    <div className="conv-graph-wrap">
      <svg viewBox="0 0 400 330" className="conv-graph-svg">
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = GRAPH_POS[edge.from];
          const to   = GRAPH_POS[edge.to];
          if (!from || !to) return null;
          const isActive = activeEdge === i;
          const sw = 1.5 + (edge.weight / maxW) * 5.5;
          const opacity = 0.25 + (edge.weight / maxW) * 0.55;
          return (
            <line key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={isActive ? "#60a5fa" : "#334155"}
              strokeWidth={isActive ? sw + 1 : sw}
              strokeOpacity={isActive ? 1 : opacity}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setActiveEdge(i)}
              onMouseLeave={() => setActiveEdge(null)}
            >
              <title>{edge.themes.join(" · ")}</title>
            </line>
          );
        })}

        {/* Nodes */}
        {matrix.nodes.map((node) => {
          const pos = GRAPH_POS[node.id];
          if (!pos) return null;
          const connected = activeEdge != null && edges[activeEdge] &&
            (edges[activeEdge].from === node.id || edges[activeEdge].to === node.id);
          const lines = GRAPH_LINES[node.id] || [node.label];

          return (
            <g key={node.id}>
              {connected && (
                <circle cx={pos.x} cy={pos.y} r={44}
                  fill={node.fill} fillOpacity={0.06}
                  stroke={node.fill} strokeWidth={1} strokeOpacity={0.3}
                />
              )}
              <circle cx={pos.x} cy={pos.y} r={32}
                fill={node.fill} fillOpacity={connected ? 0.22 : 0.1}
                stroke={node.fill} strokeWidth={connected ? 2 : 1.5}
              />
              {lines.map((line, li) => (
                <text key={li}
                  x={pos.x} y={pos.y - ((lines.length - 1) * 6) + li * 12}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fontWeight="700" fill={node.fill}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Active edge detail panel */}
      {activeEdge != null && edges[activeEdge] && (
        <div className="graph-edge-panel">
          <span className="graph-edge-cats">
            {[edges[activeEdge].from, edges[activeEdge].to]
              .map((c) => GRAPH_LINES[c]?.join(" ") || c)
              .join(" ↔ ")}
          </span>
          <span className="graph-edge-weight">Strength {edges[activeEdge].weight}</span>
          <ul className="graph-edge-themes">
            {edges[activeEdge].themes.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      )}

      {edges.length === 0 && (
        <p className="graph-empty">No cross-category convergences this period.</p>
      )}
    </div>
  );
}

// ── Chart section ─────────────────────────────────────────────────────────────

function ChartSection({ chartData, stats }) {
  if (!chartData) return null;
  const enrichPct = chartData.enrichment_stats?.rate ?? 0;

  return (
    <section className="report-section report-charts">
      <SectionHeader title="Data Overview" />
      <div className="charts-grid">
        {/* Category distribution donut */}
        <div className="chart-panel chart-panel-donut">
          <p className="chart-title">Category Distribution</p>
          <DonutChart data={chartData.category_pie} />
        </div>

        {/* Weekly activity */}
        {chartData.weekly_activity?.length > 1 && (
          <div className="chart-panel">
            <p className="chart-title">
              Weekly Activity
              <span className="chart-legend">
                <span className="legend-dot emerging" /> emerging
                <span className="legend-dot base" /> other
              </span>
            </p>
            <WeeklyActivityChart data={chartData.weekly_activity} />
          </div>
        )}

        {/* Threat maturity breakdown */}
        {chartData.maturity_bar?.length > 0 && (
          <div className="chart-panel chart-panel-wide">
            <p className="chart-title">Threat Maturity by Category</p>
            <MaturityBar data={chartData.maturity_bar} />
          </div>
        )}

        {/* Sector coverage */}
        {chartData.sector_radar?.length > 0 && (
          <div className="chart-panel">
            <p className="chart-title">Sectors Affected</p>
            <div className="css-bar-chart">
              {chartData.sector_radar.map((d, i) => {
                const max = chartData.sector_radar[0].count;
                return (
                  <div key={i} className="bar-row">
                    <span className="bar-label">{d.sector}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round((d.count / max) * 100)}%`, background: "#3b82f6" }} />
                    </div>
                    <span className="bar-value">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Enrichment stats */}
        <div className="chart-panel chart-panel-sm">
          <p className="chart-title">Enrichment Rate</p>
          <div className="enrichment-gauge">
            <div className="enrich-ring" style={{ "--pct": `${enrichPct}%` }}>
              <span className="enrich-pct">{enrichPct}%</span>
              <span className="enrich-label">AI-enriched</span>
            </div>
            <p className="enrich-sub">
              {chartData.enrichment_stats?.enriched ?? 0} of {chartData.enrichment_stats?.total ?? 0} sources
              have LLM-extracted intelligence
            </p>
          </div>
        </div>
      </div>

      {/* Tag heatmap — full width */}
      {chartData.tag_frequency?.length > 0 && (
        <div className="chart-panel chart-panel-full mt-16">
          <p className="chart-title">Tag Frequency Heatmap</p>
          <TagHeatmap tags={chartData.tag_frequency} />
        </div>
      )}
    </section>
  );
}

// ── Top developments ──────────────────────────────────────────────────────────

function DevelopmentCard({ item, rank }) {
  const [showWatch, setShowWatch] = useState(false);
  const catLabel = CATEGORY_LABELS[item.category] || formatLabel(item.category || "");
  const catColor = CAT_COLOURS[item.category] || "#6b7280";
  return (
    <article className="report-dev-card" style={{ "--cat-color": catColor }}>
      <div className="report-dev-rank">#{rank}</div>
      <div className="report-dev-body">
        <p className="eyebrow" style={{ color: catColor }}>{catLabel}</p>
        <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
        <p className="meta">{item.publisher} · {fmtDateShort(item.date_published)}</p>
        {item.short_summary && <p className="summary">{item.short_summary}</p>}
        {item.why_it_matters && (
          <p className="report-why"><strong>Why it matters:</strong> {item.why_it_matters}</p>
        )}
        <div className="report-dev-footer">
          <span className="score-pill">Score {item.report_score ?? "—"}</span>
          {item.priority_label && item.priority_label !== "low" && (
            <span className={`priority-pill ${priorityCls(item.priority_label)}`}>
              {formatLabel(item.priority_label)}
            </span>
          )}
          {item.tags?.slice(0, 3).map((t) => (
            <span key={t} className="tag-chip">{t.replaceAll("_", " ")}</span>
          ))}
          {item.watch_points?.length > 0 && (
            <button className="ghost-button xs" onClick={() => setShowWatch((s) => !s)}>
              {showWatch ? "hide" : `${item.watch_points.length} watch points`}
            </button>
          )}
        </div>
        {showWatch && item.watch_points?.length > 0 && (
          <ul className="watch-points-list">
            {item.watch_points.map((wp, i) => <li key={i}>{wp}</li>)}
          </ul>
        )}
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
          {cluster.threat_maturity && cluster.threat_maturity !== "unknown" && (
            <span className={`maturity-tag ${cluster.threat_maturity}`}>{cluster.threat_maturity}</span>
          )}
          <span className="cluster-count">{cluster.source_count} src</span>
          {cluster.horizon_relevance > 0 && (
            <span className="cluster-rel">rel {cluster.horizon_relevance}</span>
          )}
          {cluster.categories?.length > 1 && (
            <span className="cluster-cats">{cluster.categories.length} cats</span>
          )}
          <span className="cluster-chevron">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="cluster-evidence">
          {cluster.evidence?.slice(0, 4).map((e) => (
            <div key={e.source_id} className="evidence-item">
              <a href={e.url} target="_blank" rel="noreferrer" className="evidence-title">{e.title}</a>
              <span className="evidence-pub">{e.publisher} · {e.date_published?.slice(0, 10)}</span>
              {e.signal_text && <p className="evidence-signal">"{e.signal_text}"</p>}
              {e.key_facts?.why_it_matters && <p className="evidence-fact">{e.key_facts.why_it_matters}</p>}
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
  return (
    <section className="report-section">
      <SectionHeader title="Signal Clusters" count={clusters.all_clusters.length} />
      <p className="section-subtitle">
        Thematically grouped intelligence signals with supporting evidence. Click any cluster to expand.
      </p>
      <div className="signal-clusters-list">
        {clusters.all_clusters.map((c) => <SignalClusterCard key={c.theme} cluster={c} />)}
      </div>
    </section>
  );
}

// ── Cross-category convergence graph + cards ──────────────────────────────────

function ConvergenceCard({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`convergence-card${open ? " open" : ""}`}>
      <button className="conv-header" onClick={() => setOpen((o) => !o)}>
        <div className="conv-header-left">
          <p className="conv-theme">{item.theme}</p>
          <div className="conv-cats">
            {item.category_labels?.map((l) => (
              <span key={l} className="conv-cat-tag">{l}</span>
            ))}
          </div>
        </div>
        <div className="conv-badges">
          <span className="conv-strength" title="Convergence strength 1–5">
            {"●".repeat(item.strength)}{"○".repeat(Math.max(0, 5 - item.strength))}
          </span>
          {item.threat_maturity && item.threat_maturity !== "unknown" && (
            <span className={`maturity-tag ${item.threat_maturity}`}>{item.threat_maturity}</span>
          )}
          <span className="cluster-count">{item.source_count} src</span>
          <span className="cluster-chevron">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="conv-body">
          <p className="conv-desc">{item.description}</p>
          <div className="conv-evidence-list">
            {item.evidence?.slice(0, 3).map((e) => (
              <div key={e.source_id} className="conv-evidence">
                <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>
                <span className="evidence-pub">{e.publisher}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConvergenceSection({ convergences, matrix }) {
  if (!convergences?.length && !matrix?.edges?.length) return null;
  return (
    <section className="report-section">
      <SectionHeader title="Cross-Category Convergence" count={convergences?.length} />
      <p className="section-subtitle">
        Threat themes spanning multiple categories signal systemic or coordinated risk.
        Hover edges on the graph to see shared themes.
      </p>
      <div className="conv-section-layout">
        <ConvergenceGraph matrix={matrix} />
        <div className="conv-cards-list">
          {convergences?.map((c) => <ConvergenceCard key={c.theme} item={c} />)}
        </div>
      </div>
    </section>
  );
}

// ── Expandable timeline event ─────────────────────────────────────────────────

function TimelineEvent({ ev }) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CAT_COLOURS[ev.category] || "#6b7280";

  return (
    <div
      className={`tl-event-card${expanded ? " expanded" : ""}`}
      style={{ "--cat-color": catColor }}
      onClick={() => setExpanded((s) => !s)}
    >
      <div className="tl-event-header">
        <div className="tl-event-meta">
          <span className="tl-event-date">{ev.date}</span>
          <span className="tl-event-cat" style={{ color: catColor }}>
            <span className="tl-cat-dot" style={{ background: catColor }} />
            {ev.category_label}
          </span>
        </div>
        <div className="tl-event-badges">
          {ev.threat_maturity && ev.threat_maturity !== "unknown" && (
            <span className={`maturity-tag ${ev.threat_maturity}`}>{ev.threat_maturity}</span>
          )}
          {ev.priority_label && ev.priority_label !== "low" && (
            <span className={`priority-pill ${priorityCls(ev.priority_label)}`}>{ev.priority_label}</span>
          )}
          <span className="tl-expand-icon">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      <a className="tl-event-title" href={ev.url} target="_blank" rel="noreferrer"
        onClick={(e) => e.stopPropagation()}>
        {ev.title}
      </a>
      <span className="tl-event-pub">{ev.publisher}</span>

      {expanded && (
        <div className="tl-event-body" onClick={(e) => e.stopPropagation()}>
          {ev.short_summary && <p className="tl-summary">{ev.short_summary}</p>}
          {ev.what_happened && (
            <div className="tl-detail-block">
              <span className="tl-detail-label">What happened</span>
              <p>{ev.what_happened}</p>
            </div>
          )}
          {ev.impact && (
            <div className="tl-detail-block">
              <span className="tl-detail-label">Impact</span>
              <p>{ev.impact}</p>
            </div>
          )}
          {ev.why_it_matters && (
            <div className="tl-detail-block">
              <span className="tl-detail-label">Why it matters</span>
              <p>{ev.why_it_matters}</p>
            </div>
          )}
          {ev.tags?.length > 0 && (
            <div className="tl-tags-row">
              {ev.tags.map((t) => <span key={t} className="tag-chip">{t.replaceAll("_", " ")}</span>)}
            </div>
          )}
          {(ev.key_entities?.cves?.length > 0 || ev.key_entities?.threat_actors?.length > 0) && (
            <div className="tl-entities-row">
              {ev.key_entities.cves?.map((c) => <span key={c} className="entity-tag cve">{c}</span>)}
              {ev.key_entities.threat_actors?.slice(0, 3).map((a) => (
                <span key={a} className="entity-tag actor">{a}</span>
              ))}
            </div>
          )}
          {ev.sector_impact?.length > 0 && (
            <div className="tl-sectors-row">
              {ev.sector_impact.map((s) => (
                <span key={s} className="sector-badge">{s}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineSection({ timeline }) {
  const [showAll, setShowAll] = useState(false);
  if (!timeline?.events?.length) return null;

  const events = showAll ? timeline.events : timeline.events.slice(0, 20);
  let lastWeek = null;

  return (
    <section className="report-section">
      <SectionHeader title="Event Timeline" count={timeline.event_count} />
      <p className="section-subtitle">
        Top {events.length} of {timeline.event_count} significant developments, ranked by intelligence score.
        Click any event to expand details.
      </p>

      {/* Priority mini-legend */}
      <div className="timeline-legend">
        {Object.entries(MATURITY_COLOURS).map(([m, c]) => (
          <span key={m} className="tl-leg-item">
            <span className="tl-leg-dot" style={{ background: c }} />{m}
          </span>
        ))}
      </div>

      <div className="timeline-list-v2">
        {events.map((ev) => {
          const week = Object.entries(timeline.by_week || {}).find(
            ([, evs]) => evs.some((e) => e.url === ev.url)
          )?.[0];
          const showBreak = week && week !== lastWeek;
          if (showBreak) lastWeek = week;

          return (
            <div key={ev.url || ev.title}>
              {showBreak && (
                <div className="timeline-week-break">
                  <span>{week}</span>
                  <span className="week-count">{timeline.weekly_counts?.[week]} events</span>
                </div>
              )}
              <TimelineEvent ev={ev} />
            </div>
          );
        })}
      </div>

      {!showAll && timeline.event_count > 20 && (
        <button className="ghost-button sm" onClick={() => setShowAll(true)}>
          Show {timeline.event_count - 20} more events
        </button>
      )}
    </section>
  );
}

// ── Sector alerts ─────────────────────────────────────────────────────────────

function SectorAlertsSection({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <section className="report-section">
      <SectionHeader title="Sector Impact" count={alerts.length} />
      <p className="section-subtitle">Sectors most represented in this period's intelligence.</p>
      <div className="sector-alerts-grid">
        {alerts.slice(0, 8).map((a) => (
          <div key={a.sector} className="sector-alert-card">
            <div className="sector-alert-header">
              <span className="sector-name">{a.sector}</span>
              <span className="sector-count">{a.count}</span>
            </div>
            <div className="sector-sources">
              {a.top_sources?.slice(0, 2).map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="sector-source-link">
                  {s.title}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Category breakdown ────────────────────────────────────────────────────────

function CategorySection({ section, signalClusters }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? section.top_sources : section.top_sources.slice(0, 3);
  const clusters = signalClusters?.by_category?.[section.category] || [];
  const catColor  = CAT_COLOURS[section.category] || "#6b7280";

  return (
    <div className="report-cat-section" style={{ "--cat-color": catColor }}>
      <div className="report-cat-header">
        <div>
          <p className="eyebrow" style={{ color: catColor }}>Category</p>
          <h3>{section.label}</h3>
        </div>
        <span className="report-cat-count">{section.count} sources</span>
      </div>

      {clusters.filter((c) => !c.theme.startsWith("Other")).length > 0 && (
        <div className="cat-clusters">
          {clusters.filter((c) => !c.theme.startsWith("Other")).slice(0, 3).map((c) => (
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
            <a className="report-source-title" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
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

// ── Key entities ──────────────────────────────────────────────────────────────

function KeyEntitiesSection({ entities }) {
  if (!entities) return null;
  const hasContent = entities.threat_actors?.length || entities.tools_and_techniques?.length
    || entities.cves?.length || entities.affected_products?.length;
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
        {entities.affected_products?.length > 0 && (
          <div className="entity-group">
            <p className="eyebrow">Affected Products & Systems</p>
            <div className="entity-tags">
              {entities.affected_products.slice(0, 15).map((e) => (
                <span key={e.name} className="entity-tag product">{e.name} ({e.count})</span>
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

// ── Archive navigator ─────────────────────────────────────────────────────────

function ArchiveNav({ period, currentWeekKey, onSelectWeek }) {
  const [archives, setArchives] = useState([]);

  useEffect(() => {
    fetch(`/api/generate-report?list=1&period=${period}`)
      .then((r) => r.json())
      .then((d) => setArchives(d.reports || []))
      .catch(() => {});
  }, [period]);

  if (!archives.length) return null;

  return (
    <div className="archive-nav">
      <span className="archive-nav-label">Archive:</span>
      <div className="archive-nav-list">
        {archives.map((r) => (
          <button key={r.report_id}
            className={`archive-nav-btn${r.week_key === currentWeekKey ? " active" : ""}`}
            onClick={() => onSelectWeek(r.week_key)}
            title={`${r.date_from} → ${r.date_to} · ${r.source_count} sources`}
          >
            {archiveBtnLabel(r)}
            {!r.is_complete && <span className="live-dot" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReportPage() {
  const [period, setPeriod]         = useState("weekly");
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [report, setReport]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const loadReport = useCallback(() => {
    setReport(null); setError(null); setLoading(true);
    const url = selectedWeek
      ? `/api/generate-report?period=${period}&week=${selectedWeek}`
      : `/api/generate-report?period=${period}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setReport(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [period, selectedWeek]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const handlePeriodChange = (p) => { setPeriod(p); setSelectedWeek(null); };

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

      <div className="archive-bar">
        <ArchiveNav period={period} currentWeekKey={report?.week_key}
          onSelectWeek={(w) => setSelectedWeek(w)} />
      </div>

      {loading && (
        <section className="panel loading-panel">
          <div className="loading-spinner" />
          <p>Loading report…</p>
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
            <StatPill label="Total sources" value={stats.total_sources} delta={pc?.delta?.source_count?.change} />
            <StatPill label="Core" value={stats.by_relevance_tier?.core} highlight />
            <StatPill label="Adjacent" value={stats.by_relevance_tier?.adjacent} />
            <StatPill label="Agentic AI" value={stats.by_category?.agentic_ai_threats ?? 0}
              delta={pc?.delta?.by_category?.agentic_ai_threats?.change} />
            <StatPill label="LLM threats" value={stats.by_category?.llm_threats ?? 0}
              delta={pc?.delta?.by_category?.llm_threats?.change} />
            <StatPill label="AI-enabled" value={stats.by_category?.ai_enabled_threats ?? 0} />
            <StatPill label="Traditional ML" value={stats.by_category?.traditional_ai_threats ?? 0} />
            {stats.threat_maturity?.emerging > 0 && (
              <StatPill label="Emerging" value={stats.threat_maturity.emerging} highlight
                delta={pc?.delta?.by_maturity?.emerging?.change} />
            )}
            <StatPill label="Enriched" value={stats.enriched} />
          </section>

          {/* S1: Strategic shifts */}
          <StrategicShifts shifts={report.executive?.strategic_shifts} comparison={report.period_comparison} />

          {/* S2: Data overview */}
          <ChartSection chartData={report.chart_data} stats={stats} />

          {/* S3: Top developments */}
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

          {/* S4: Emerging threats */}
          {report.executive?.emerging_threats?.length > 0 && (
            <section className="report-section">
              <SectionHeader title="Emerging & Growing Threats" count={report.executive.emerging_threats.length} />
              <div className="report-dev-list">
                {report.executive.emerging_threats.slice(0, 8).map((item, i) => (
                  <DevelopmentCard key={item.url} item={item} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          {/* S5: Signal clusters */}
          <SignalClusters clusters={report.threat_landscape?.signal_clusters} />

          {/* S6: Cross-category convergence graph */}
          <ConvergenceSection
            convergences={report.threat_landscape?.convergences}
            matrix={report.chart_data?.convergence_matrix}
          />

          {/* S7: Timeline */}
          <TimelineSection timeline={report.timeline} />

          {/* S8: Sector impact */}
          <SectorAlertsSection alerts={report.sector_alerts} />

          {/* S9: Category breakdown */}
          <section className="report-section">
            <SectionHeader title="Category Breakdown" />
            <div className="report-categories">
              {report.category_breakdown?.map((cat) => (
                <CategorySection key={cat.category} section={cat}
                  signalClusters={report.threat_landscape?.signal_clusters} />
              ))}
            </div>
          </section>

          {/* S10: Key entities */}
          <KeyEntitiesSection entities={report.key_entities} />

          <p className="report-footer-note">
            {report.week_key} · Generated {new Date(report.generated_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
            {" · "}{stats.enriched}/{stats.total_sources} sources AI-enriched
            {!report.is_complete && " · In progress"}
          </p>
        </>
      )}
    </>
  );
}
