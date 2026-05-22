/**
 * Period-to-period comparison for strategic shift detection.
 *
 * Compares the current reporting period against the equivalent prior period
 * (same duration, immediately preceding) to identify what's new, growing,
 * or declining in the threat landscape.
 *
 * Used in: strategic shifts section, executive summary delta stats.
 *
 * Output shape:
 * {
 *   current:  { start, end, source_count, by_category, by_maturity, by_priority, top_tags }
 *   prior:    { start, end, source_count, by_category, by_maturity, by_priority, top_tags }
 *   delta: {
 *     source_count:   { current, prior, change, pct_change }
 *     by_category:    { [cat]: { current, prior, change, direction } }
 *     by_maturity:    { emerging: {...}, growing: {...}, ... }
 *     top_tags:       { new: [], grew: [], declined: [] }
 *     new_actors:     string[]   — threat actors appearing this period but not prior
 *     new_techniques: string[]   — tools/techniques appearing this period but not prior
 *     new_cves:       string[]   — CVEs appearing this period but not prior
 *   }
 *   strategic_shifts: string[]   — human-readable shift observations, max 6
 * }
 */

import { supabase } from "../storage/supabaseClient.js";

const CATEGORY_ORDER = [
  "agentic_ai_threats",
  "llm_threats",
  "ai_enabled_threats",
  "traditional_ai_threats",
  "uncategorised",
];

async function fetchPeriodSources(start, end) {
  const { data, error } = await supabase
    .from("sources")
    .select(
      "id, main_category, relevance_tier, priority_label, tags, " +
      "intelligence, claim_extraction_status, date_published"
    )
    .gte("date_published", start)
    .lte("date_published", end)
    .in("relevance_tier", ["core", "adjacent", "context"])
    .limit(1000);

  if (error) throw error;
  return data || [];
}

function countByCategory(sources) {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0]));
  for (const s of sources) {
    const cat = s.main_category || "uncategorised";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

function countByMaturity(sources) {
  const counts = { emerging: 0, growing: 0, established: 0, declining: 0, unknown: 0 };
  for (const s of sources) {
    const m = s.intelligence?.threat_maturity || "unknown";
    counts[m] = (counts[m] || 0) + 1;
  }
  return counts;
}

function countByPriority(sources) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unscored: 0 };
  for (const s of sources) {
    const p = s.priority_label || "unscored";
    counts[p] = (counts[p] || 0) + 1;
  }
  return counts;
}

function topTags(sources, limit = 20) {
  const freq = new Map();
  for (const s of sources) {
    for (const tag of s.tags || []) {
      freq.set(tag, (freq.get(tag) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;

function entitySets(sources) {
  const actors     = new Set();
  const techniques = new Set();
  const cves       = new Set();
  for (const s of sources) {
    const ke = s.intelligence?.key_entities || {};
    for (const a of ke.threat_actors        || []) actors.add(a);
    for (const t of ke.tools_and_techniques || []) techniques.add(t);
    for (const c of ke.cves                 || []) {
      if (CVE_RE.test(c)) cves.add(c.toUpperCase());
    }
  }
  return { actors, techniques, cves };
}

function delta(current, prior) {
  const change = current - prior;
  const pct = prior === 0 ? null : Math.round((change / prior) * 100);
  return { current, prior, change, pct_change: pct };
}

function direction(change) {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "stable";
}

const CAT_LABEL = {
  llm_threats:            "LLM & foundation model threats",
  agentic_ai_threats:     "Agentic AI threats",
  ai_enabled_threats:     "AI-enabled attack techniques",
  traditional_ai_threats: "Traditional ML & model attacks",
  uncategorised:          "general AI security coverage",
};

function summariseShifts(deltas, currentSources, priorSources) {
  const shifts = [];

  // 1. Overall volume change
  const { change: volChange, pct_change: volPct, current: curVol, prior: priorVol } = deltas.source_count;
  if (volChange !== 0 && volPct !== null) {
    const dir    = volChange > 0 ? "increased" : "decreased";
    const pctStr = volPct !== null ? ` (${volPct > 0 ? "+" : ""}${volPct}%)` : "";
    shifts.push(
      `AI threat coverage ${dir} by ${Math.abs(volChange)} sources this period${pctStr}, ` +
      `up from ${priorVol} to ${curVol} total sources.`
    );
  }

  // 2. Category shifts — biggest absolute movers (up and down separately)
  const catEntries = Object.entries(deltas.by_category)
    .filter(([cat]) => cat !== "uncategorised")
    .filter(([, d]) => Math.abs(d.change) >= 3)
    .sort((a, b) => Math.abs(b[1].change) - Math.abs(a[1].change));

  // Biggest riser
  const riser = catEntries.find(([, d]) => d.change > 0);
  if (riser) {
    const [cat, d] = riser;
    const pctStr   = d.prior > 0 ? ` (+${Math.round((d.change / d.prior) * 100)}%)` : "";
    shifts.push(
      `${CAT_LABEL[cat] || cat} saw the strongest growth, rising from ` +
      `${d.prior} to ${d.current} sources${pctStr}.`
    );
  }

  // Biggest faller (if any)
  const faller = catEntries.find(([, d]) => d.change < 0);
  if (faller) {
    const [cat, d] = faller;
    shifts.push(
      `${CAT_LABEL[cat] || cat} declined from ${d.prior} to ${d.current} sources, ` +
      `suggesting reduced activity or shifting focus.`
    );
  }

  // Second riser if we have room
  if (riser && !faller) {
    const secondRiser = catEntries.filter(([, d]) => d.change > 0).slice(1, 2);
    for (const [cat, d] of secondRiser) {
      shifts.push(
        `${CAT_LABEL[cat] || cat} also expanded, growing from ${d.prior} to ${d.current} sources.`
      );
    }
  }

  // 3. Emerging threat velocity
  const curEmerging   = deltas.by_maturity.emerging?.current || 0;
  const priorEmerging = deltas.by_maturity.emerging?.prior   || 0;
  if (curEmerging > priorEmerging + 2) {
    const pct = priorEmerging > 0
      ? ` (+${Math.round(((curEmerging - priorEmerging) / priorEmerging) * 100)}%)`
      : "";
    shifts.push(
      `Emerging threat signals accelerated from ${priorEmerging} to ${curEmerging} sources${pct}, ` +
      `indicating new or rapidly maturing attack patterns.`
    );
  } else if (curEmerging > 0 && priorEmerging === 0) {
    shifts.push(
      `${curEmerging} newly-classified emerging threats appeared this period with no prior-period precedent.`
    );
  }

  // 4. New threat actors
  if (deltas.new_actors.length > 0) {
    const listed = deltas.new_actors.slice(0, 4).join(", ");
    const more   = deltas.new_actors.length > 4 ? ` and ${deltas.new_actors.length - 4} others` : "";
    shifts.push(`New threat actors observed this period: ${listed}${more}.`);
  }

  // 5. New techniques (only if meaningful number)
  if (deltas.new_techniques.length >= 5) {
    const listed = deltas.new_techniques.slice(0, 3).join(", ");
    shifts.push(
      `${deltas.new_techniques.length} new tools or techniques appeared for the first time, ` +
      `including ${listed}.`
    );
  }

  // 6. New CVEs
  if (deltas.new_cves.length > 0) {
    const n = deltas.new_cves.length;
    const listed = deltas.new_cves.slice(0, 4).join(", ");
    shifts.push(`${n} new CVE${n > 1 ? "s" : ""} tracked this period: ${listed}${n > 4 ? "…" : ""}.`);
  }

  return shifts.slice(0, 6);
}

/**
 * Compare current period to the immediately preceding period of equal length.
 *
 * @param {string} currentStart - ISO date string
 * @param {string} currentEnd   - ISO date string
 */
export async function comparePeriods(currentStart, currentEnd) {
  const durationMs = new Date(currentEnd) - new Date(currentStart);

  const priorEnd   = new Date(new Date(currentStart).getTime() - 1).toISOString();
  const priorStart = new Date(new Date(currentStart).getTime() - durationMs).toISOString();

  const [currentSources, priorSources] = await Promise.all([
    fetchPeriodSources(currentStart, currentEnd),
    fetchPeriodSources(priorStart, priorEnd),
  ]);

  const current = {
    start:        currentStart,
    end:          currentEnd,
    source_count: currentSources.length,
    by_category:  countByCategory(currentSources),
    by_maturity:  countByMaturity(currentSources),
    by_priority:  countByPriority(currentSources),
    top_tags:     topTags(currentSources),
  };

  const prior = {
    start:        priorStart,
    end:          priorEnd,
    source_count: priorSources.length,
    by_category:  countByCategory(priorSources),
    by_maturity:  countByMaturity(priorSources),
    by_priority:  countByPriority(priorSources),
    top_tags:     topTags(priorSources),
  };

  // Entity sets for new-actor / new-technique detection
  const curEntities  = entitySets(currentSources);
  const priorEntities = entitySets(priorSources);

  const newActors     = [...curEntities.actors].filter((a) => !priorEntities.actors.has(a));
  const newTechniques = [...curEntities.techniques].filter((t) => !priorEntities.techniques.has(t));
  const newCVEs       = [...curEntities.cves].filter((c) => !priorEntities.cves.has(c));

  // Build deltas
  const byCategoryDelta = {};
  for (const cat of CATEGORY_ORDER) {
    const c = current.by_category[cat] || 0;
    const p = prior.by_category[cat]   || 0;
    byCategoryDelta[cat] = { current: c, prior: p, change: c - p, direction: direction(c - p) };
  }

  const byMaturityDelta = {};
  for (const m of ["emerging", "growing", "established", "declining", "unknown"]) {
    const c = current.by_maturity[m] || 0;
    const p = prior.by_maturity[m]   || 0;
    byMaturityDelta[m] = { current: c, prior: p, change: c - p, direction: direction(c - p) };
  }

  // Tag comparison: new tags, grew tags, declined tags
  const priorTagMap = new Map(prior.top_tags.map((t) => [t.tag, t.count]));
  const curTagMap   = new Map(current.top_tags.map((t) => [t.tag, t.count]));
  const newTags     = [...curTagMap.keys()].filter((t) => !priorTagMap.has(t));
  const grewTags    = [...curTagMap.entries()]
    .filter(([t, c]) => (priorTagMap.get(t) || 0) > 0 && c > (priorTagMap.get(t) || 0))
    .sort((a, b) => (b[1] - (priorTagMap.get(b[0]) || 0)) - (a[1] - (priorTagMap.get(a[0]) || 0)))
    .slice(0, 5)
    .map(([tag]) => tag);
  const declinedTags = [...priorTagMap.keys()]
    .filter((t) => !curTagMap.has(t) || (curTagMap.get(t) || 0) < (priorTagMap.get(t) || 0))
    .slice(0, 5);

  const deltas = {
    source_count:   delta(current.source_count, prior.source_count),
    by_category:    byCategoryDelta,
    by_maturity:    byMaturityDelta,
    top_tags:       { new: newTags, grew: grewTags, declined: declinedTags },
    new_actors:     newActors,
    new_techniques: newTechniques,
    new_cves:       newCVEs,
  };

  const strategicShifts = summariseShifts(deltas, currentSources, priorSources);

  return { current, prior, delta: deltas, strategic_shifts: strategicShifts };
}
