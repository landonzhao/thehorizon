/**
 * Aggregates and deduplicates defender implications across events, trends,
 * and strategic shifts into a structured operational guidance section.
 *
 * Deterministic — groups by implication type and deduplicates by semantic
 * similarity of leading words. No LLM required.
 */

// Implication categories that appear in the monthly report
const IMPLICATION_CATEGORIES = [
  "monitoring",
  "architecture",
  "detection",
  "identity_access",
  "patching",
  "governance",
  "ai_deployment",
];

// Keyword heuristics to classify an implication string
const CATEGORY_SIGNALS = {
  monitoring:      ["monitor", "detect", "watch", "alert", "log", "track", "telemetry", "visibility"],
  architecture:    ["architect", "segment", "isolat", "network", "boundary", "zero trust", "design", "decompos"],
  detection:       ["detect", "rule", "sigma", "yara", "alert", "edr", "siem", "fingerprint"],
  identity_access: ["identity", "access", "authenti", "privilege", "mfa", "rbac", "zero standing", "credential"],
  patching:        ["patch", "update", "version", "upgrade", "mitigat", "cve", "remediat"],
  governance:      ["policy", "govern", "framework", "review", "audit", "approval", "process"],
  ai_deployment:   ["llm", "model", "ai system", "agent", "deploy", "prompt", "rag", "embedding", "inference"],
};

function classifyImplication(text = "") {
  const lower = text.toLowerCase();
  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
    if (signals.some((s) => lower.includes(s))) return cat;
  }
  return "monitoring";
}

function dedupImplications(implications) {
  const seen = new Set();
  return implications.filter((imp) => {
    // Use first 60 chars as dedup key
    const key = imp.text.trim().toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {object[]} events
 * @param {object[]} trends
 * @param {object[]} shifts
 * @returns {object[]}  - array of { category, implications[] }
 */
export function generateDefenderImplications(events, trends, shifts) {
  const all = [];

  // Collect from events (prioritise high-scoring events)
  for (const event of events.sort((a, b) => (b.event_priority_score || 0) - (a.event_priority_score || 0)).slice(0, 20)) {
    if (event.defender_implications) {
      all.push({ text: event.defender_implications, source: "event", score: event.event_priority_score || 0 });
    }
  }

  // Collect from trends
  for (const trend of trends) {
    if (trend.defender_implications) {
      all.push({ text: trend.defender_implications, source: "trend", score: trend.trend_score || 0 });
    }
    if (trend.operational_relevance) {
      all.push({ text: trend.operational_relevance, source: "trend", score: trend.trend_score || 0 });
    }
  }

  // Collect from shifts (highest priority)
  for (const shift of shifts) {
    if (shift.implications_for_defenders) {
      all.push({ text: shift.implications_for_defenders, source: "shift", score: 100 });
    }
  }

  // Classify and deduplicate
  const categorised = {};
  for (const cat of IMPLICATION_CATEGORIES) categorised[cat] = [];

  for (const imp of all) {
    const cat = classifyImplication(imp.text);
    categorised[cat].push(imp);
  }

  return IMPLICATION_CATEGORIES.map((cat) => ({
    category: cat,
    implications: dedupImplications(
      categorised[cat].sort((a, b) => b.score - a.score)
    ).slice(0, 5),
  })).filter((c) => c.implications.length > 0);
}
