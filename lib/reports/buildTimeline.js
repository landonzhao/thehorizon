/**
 * Event timeline builder for report generation.
 *
 * Selects the most significant sources from the period, orders them
 * chronologically, and annotates each with entities, impact context,
 * and a severity signal. Used in the "timeline of major developments"
 * section of the horizon scan report.
 *
 * Output shape:
 * {
 *   events: [
 *     {
 *       date: "2026-04-15",
 *       title, url, publisher,
 *       category, category_label,
 *       tags,
 *       priority_label,           // critical | high | medium | low
 *       horizon_relevance,        // 1–5 from intelligence
 *       threat_maturity,          // emerging | growing | established | declining
 *       report_tier,              // weekly | monthly | quarterly | archive_only
 *       short_summary,
 *       what_happened,            // from analyst_brief
 *       impact,                   // from analyst_brief
 *       why_it_matters,           // from analyst_brief
 *       key_entities: {
 *         threat_actors, tools_and_techniques, affected_products, cves
 *       },
 *       sector_impact,
 *     }
 *   ],
 *   by_week: { "2026-W16": event[], ... },  // grouped by ISO week
 *   weekly_counts: { "2026-W16": 5, ... },
 * }
 */

const CATEGORY_LABELS = {
  llm_threats:             "LLM & Foundation Model Threats",
  agentic_ai_threats:      "Agentic AI & Autonomous System Threats",
  ai_enabled_threats:      "AI-Enabled Attack Techniques",
  traditional_ai_threats:  "Traditional ML & Model Attacks",
  uncategorised:           "General AI Security Context",
};

// ISO week string: "2026-W16"
function isoWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "unknown";
  const thu = new Date(d);
  thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const year = thu.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round((thu - jan4) / 604800000);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function dateOnly(dateStr) {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 10);
}

// Score how timeline-worthy a source is (higher = more important).
// Combines report_score (already computed) with maturity weighting.
function timelineScore(source) {
  const base = source.report_score || 0;
  const horizonBonus = (source.intelligence?.horizon_relevance || 0) * 3;
  const maturityBonus = {
    emerging: 8,
    growing: 5,
    established: 2,
    declining: 0,
  }[source.intelligence?.threat_maturity] || 0;
  const tierBonus = {
    weekly: 10,
    monthly: 5,
    quarterly: 2,
    archive_only: 0,
  }[source.intelligence?.report_tier] || 0;
  return base + horizonBonus + maturityBonus + tierBonus;
}

/**
 * Build the timeline from a list of enriched sources.
 *
 * @param {object[]} sources - enriched sources (must have date_published)
 * @param {object}   options
 * @param {number}   options.maxEvents - cap total events (default 60)
 * @param {string[]} options.minPriority - include only these priority labels
 *                   (default: all — ["critical","high","medium","low"])
 */
export function buildTimeline(sources, {
  maxEvents = 60,
  minPriority = ["critical", "high", "medium", "low"],
} = {}) {
  const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

  // Filter: must have a date, and meet priority threshold if specified
  const eligible = sources.filter((s) => {
    if (!s.date_published) return false;
    if (minPriority.length < 4) {
      const rank = PRIORITY_RANK[s.priority_label] || 0;
      const minRank = Math.min(...minPriority.map((p) => PRIORITY_RANK[p] || 0));
      if (rank < minRank) return false;
    }
    return true;
  });

  // Score and pick top N
  const ranked = eligible
    .map((s) => ({ source: s, score: timelineScore(s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEvents)
    .map((r) => r.source);

  // Sort chronologically
  ranked.sort((a, b) => new Date(a.date_published) - new Date(b.date_published));

  const events = ranked.map((s) => {
    const intel = s.intelligence || {};
    const ke = intel.key_entities || {};
    return {
      date:              dateOnly(s.date_published),
      title:             s.title,
      url:               s.url,
      publisher:         s.publisher,
      source_type:       s.source_type,
      category:          s.main_category || "uncategorised",
      category_label:    CATEGORY_LABELS[s.main_category] || s.main_category,
      tags:              s.tags || [],
      priority_label:    s.priority_label || "low",
      report_score:      s.report_score || 0,
      horizon_relevance: intel.horizon_relevance || 0,
      threat_maturity:   intel.threat_maturity || null,
      report_tier:       intel.report_tier || null,
      short_summary:     s.short_summary || null,
      what_happened:     s.analyst_brief?.what_happened || null,
      impact:            s.analyst_brief?.impact || null,
      why_it_matters:    s.analyst_brief?.why_it_matters || null,
      watch_points:      s.analyst_brief?.watch_points || [],
      key_entities: {
        threat_actors:        ke.threat_actors || [],
        tools_and_techniques: ke.tools_and_techniques || [],
        affected_products:    ke.affected_products || [],
        cves:                 ke.cves || [],
      },
      sector_impact:     intel.sector_impact || [],
    };
  });

  // Group by ISO week
  const byWeek = {};
  for (const ev of events) {
    const week = isoWeek(ev.date);
    if (!byWeek[week]) byWeek[week] = [];
    byWeek[week].push(ev);
  }

  const weeklyCounts = Object.fromEntries(
    Object.entries(byWeek).map(([w, evs]) => [w, evs.length])
  );

  // Summary stats
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const categoryCounts = {};
  for (const ev of events) {
    priorityCounts[ev.priority_label] = (priorityCounts[ev.priority_label] || 0) + 1;
    categoryCounts[ev.category] = (categoryCounts[ev.category] || 0) + 1;
  }

  return {
    event_count:      events.length,
    events,
    by_week:          byWeek,
    weekly_counts:    weeklyCounts,
    priority_counts:  priorityCounts,
    category_counts:  categoryCounts,
  };
}
