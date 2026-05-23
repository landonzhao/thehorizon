/**
 * Deterministic trend clustering.
 *
 * Groups related events into broader trends. An event can belong to at most
 * one trend (greedy assignment to best match). Trend clusters use:
 * 1. threat_category alignment
 * 2. attack tag overlap
 * 3. AI stack layer overlap
 * 4. Temporal proximity (events within the trend window)
 *
 * No LLM required — synthesis runs later in synthesiseTrend.js.
 */

import crypto from "crypto";

// Events must overlap in at least this many tags to be merged into a trend.
const MIN_TAG_OVERLAP = 1;

// Maximum age gap between events in the same trend (days).
const TREND_DATE_WINDOW_DAYS = 90;

// Minimum events to form a trend (single-event "trends" are noise).
const MIN_EVENTS_PER_TREND = 1;

// Tag groups that represent distinct attack technique families.
// Events sharing tags from the same group are candidate trend members.
const TAG_FAMILY_GROUPS = [
  ["prompt_injection", "jailbreak", "guardrail_bypass", "insecure_output_handling"],
  ["agent_hijacking", "excessive_agency", "mcp_exploitation", "tool_misuse"],
  ["rag_attack", "data_poisoning", "model_backdoor", "embedding_attack"],
  ["ml_supply_chain", "model_extraction", "data_poisoning"],
  ["deepfake", "voice_cloning", "ai_generated_phishing", "ai_generated_malware"],
  ["sensitive_data_disclosure", "training_data_extraction", "privacy_attack"],
  ["ai_reconnaissance", "ai_enabled_attack_automation"],
  ["actively_exploited", "proof_of_concept"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(v) {
  return crypto.createHash("sha256").update(String(v)).digest("hex");
}

function tagsOf(event) {
  return new Set(event.tags || []);
}

function tagOverlap(a, b) {
  const ta = tagsOf(a);
  const tb = tagsOf(b);
  return [...ta].filter((t) => tb.has(t)).length;
}

function layerOverlap(a, b) {
  const la = new Set(a.affected_ai_stack_layers || []);
  const lb = new Set(b.affected_ai_stack_layers || []);
  return [...la].filter((l) => lb.has(l)).length;
}

function dateOf(event) {
  const d = new Date(event.last_seen || event.first_seen);
  return isNaN(d.getTime()) ? new Date() : d;
}

function daysBetween(a, b) {
  return Math.abs(dateOf(a).getTime() - dateOf(b).getTime()) / 86_400_000;
}

// Build the dominant tag family for an event (which tag group it belongs to most)
function dominantFamily(event) {
  const tags = tagsOf(event);
  let bestGroup = -1;
  let bestScore = 0;
  for (let i = 0; i < TAG_FAMILY_GROUPS.length; i++) {
    const score = TAG_FAMILY_GROUPS[i].filter((t) => tags.has(t)).length;
    if (score > bestScore) { bestScore = score; bestGroup = i; }
  }
  return bestGroup;
}

function trendId(events) {
  const key = events.map((e) => e.event_id).sort().join("|");
  return `trend-${sha256(key).slice(0, 24)}`;
}

// ── Main clustering ───────────────────────────────────────────────────────────

/**
 * @param {object[]} events  - scored event objects
 * @returns {{ trends: TrendCluster[], event_to_trend: Map<string, string> }}
 */
export function clusterEventsIntoTrends(events) {
  // Sort events: most significant first (affects which cluster anchors trends)
  const sorted = events.slice().sort((a, b) => (b.event_report_score || 0) - (a.event_report_score || 0));

  const trends = [];
  const assigned = new Set();

  for (const event of sorted) {
    if (assigned.has(event.event_id)) continue;

    // Find best existing trend to join
    let bestTrendIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < trends.length; i++) {
      const trend = trends[i];
      const rep = trend.events[0];

      // Must share the same threat category (primary filter)
      if (rep.threat_category !== event.threat_category) continue;

      // Must be within temporal window
      if (daysBetween(event, rep) > TREND_DATE_WINDOW_DAYS) continue;

      const tagScore   = tagOverlap(event, rep);
      const layerScore = layerOverlap(event, rep);
      const familyMatch = dominantFamily(event) !== -1 && dominantFamily(event) === dominantFamily(rep) ? 2 : 0;

      const combined = tagScore + layerScore + familyMatch;
      if (combined >= MIN_TAG_OVERLAP && combined > bestScore) {
        bestScore = combined;
        bestTrendIdx = i;
      }
    }

    if (bestTrendIdx !== -1) {
      trends[bestTrendIdx].events.push(event);
      assigned.add(event.event_id);
    } else {
      // Create new trend seed
      trends.push({ events: [event] });
      assigned.add(event.event_id);
    }
  }

  // Filter trends below minimum event count and finalise
  const event_to_trend = new Map();

  const result = trends
    .filter((t) => t.events.length >= MIN_EVENTS_PER_TREND)
    .map((trend) => {
      const evts = trend.events;
      const allTags = evts.flatMap((e) => [...tagsOf(e)]);
      const allLayers = evts.flatMap((e) => e.affected_ai_stack_layers || []);
      const allSectors = evts.flatMap((e) => e.affected_sectors || []);
      const allGeo = evts.flatMap((e) => e.geographic_scope || []);
      const allCves = evts.flatMap((e) => e.cve_ids || []);

      // Tag frequency — for trend title generation
      const tagFreq = {};
      for (const t of allTags) tagFreq[t] = (tagFreq[t] || 0) + 1;
      const dominantTags = Object.entries(tagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t]) => t);

      const dates = evts.map((e) => new Date(e.first_seen || Date.now()).getTime());
      const first_seen = new Date(Math.min(...dates)).toISOString();
      const latest_seen = new Date(Math.max(...dates)).toISOString();

      const sgRelevant = evts.some((e) => e.singapore_asean_relevance) ||
        allGeo.some((g) => ["singapore","asean","sea"].includes(g.toLowerCase()));

      const threatCategories = [...new Set(evts.map((e) => e.threat_category))];
      const tId = trendId(evts);

      const trend_obj = {
        trend_id:              tId,
        trend_title:           null,  // filled by synthesiseTrend
        threat_categories:     threatCategories,
        affected_ai_stack_layers: [...new Set(allLayers)],
        supporting_event_ids:  evts.map((e) => e.event_id),
        supporting_source_count: evts.reduce((sum, e) => sum + (e.source_count || 1), 0),
        dominant_tags:         dominantTags,
        cve_ids:               [...new Set(allCves)],
        geographic_scope:      [...new Set(allGeo)],
        singapore_asean_relevance: sgRelevant,
        affected_sectors:      [...new Set(allSectors)].slice(0, 10),

        first_seen,
        latest_seen,

        // Aggregated scores
        max_event_priority:  Math.max(...evts.map((e) => e.event_priority_score || 0)),
        avg_event_priority:  evts.reduce((s, e) => s + (e.event_priority_score || 0), 0) / evts.length,
        max_event_report:    Math.max(...evts.map((e) => e.event_report_score || 0)),

        // Placeholders filled by synthesiseTrend + scoreTrend
        summary:                  null,
        evidence_summary:         null,
        trend_strength:           null,
        maturity_level:           null,
        trajectory:               null,
        confidence_level:         null,
        strategic_significance:   null,
        operational_relevance:    null,
        watch_window:             null,
        defender_implications:    null,
        key_indicators_next_month: [],
        trend_score:              null,

        events: evts,  // full event objects (not persisted — used by synthesis)
      };

      for (const e of evts) event_to_trend.set(e.event_id, tId);
      return trend_obj;
    });

  return { trends: result, event_to_trend };
}
