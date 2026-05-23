/**
 * Aggregates watch indicators from events, trends, and convergence points
 * into a prioritised horizon watch list.
 *
 * Deterministic — no LLM required.
 */

export function generateWatchIndicators(events, trends, convergencePoints) {
  const all = [];

  // From events (limit to high-scoring)
  for (const event of events.sort((a, b) => (b.event_report_score || 0) - (a.event_report_score || 0)).slice(0, 15)) {
    for (const ind of event.watch_indicators || []) {
      all.push({
        indicator: String(ind),
        source_type: "event",
        source_id:   event.event_id,
        source_title: event.event_title || event.event_id,
        priority_score: event.event_priority_score || 0,
        report_score:   event.event_report_score || 0,
        maturity_level: event.maturity_level || "emerging",
        singapore_asean_relevance: event.singapore_asean_relevance || false,
      });
    }
  }

  // From trends
  for (const trend of trends) {
    for (const ind of trend.key_indicators_next_month || []) {
      all.push({
        indicator: String(ind),
        source_type: "trend",
        source_id:   trend.trend_id,
        source_title: trend.trend_title || trend.trend_id,
        priority_score: trend.max_event_priority || 0,
        report_score:   trend.trend_score || 0,
        maturity_level: trend.maturity_level || "emerging",
        singapore_asean_relevance: trend.singapore_asean_relevance || false,
      });
    }
  }

  // From convergence points
  for (const cp of convergencePoints) {
    for (const ind of cp.watch_indicators || []) {
      all.push({
        indicator: String(ind),
        source_type: "convergence",
        source_id:   cp.pattern_id,
        source_title: cp.title,
        priority_score: cp.supporting_event_count * 10,
        report_score:   cp.supporting_event_count * 12,
        maturity_level: "emerging",
        singapore_asean_relevance: cp.singapore_asean_relevance || false,
      });
    }
  }

  // Deduplicate by first 80 chars
  const seen = new Set();
  const deduped = all.filter((item) => {
    const key = item.indicator.trim().toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: Singapore-relevant first within each priority band, then by score
  return deduped
    .sort((a, b) => {
      const scoreDiff = (b.priority_score + b.report_score) - (a.priority_score + a.report_score);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.singapore_asean_relevance ? 1 : 0) - (a.singapore_asean_relevance ? 1 : 0);
    })
    .slice(0, 20);
}
