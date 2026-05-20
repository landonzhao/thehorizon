import { useState, useEffect } from "react";
import { TagList } from "../components/SourceCard.jsx";
import { CATEGORY_LABELS, REPORT_PERIOD_DAYS } from "../constants.js";
import { formatLabel, formatDate } from "../utils.js";

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

export function ReportPage() {
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
  const endDate = new Date().toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric",
  });
  const startDate = new Date(Date.now() - days * 86400000).toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric",
  });

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
                        {s.threat_maturity && (
                          <span className={`maturity-tag ${s.threat_maturity}`}>{s.threat_maturity}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="report-section">
            <h2 className="report-section-title">Category Breakdown</h2>
            <div className="report-categories">
              {report.category_breakdown?.map((cat) => (
                <ReportCategorySection key={cat.category} section={cat} />
              ))}
            </div>
          </section>

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
