import {
  SCORE_VERSION,
  HIGH_SEVERITY_TAGS,
  ELEVATED_SEVERITY_TAGS,
  LOW_VALUE_SIGNALS,
  IOC_SIGNALS,
  CREDIBILITY_BY_TIER,
  CATEGORY_BASE_RELEVANCE,
} from "./relevanceRules.js";

function textOf(source) {
  return [source.title, source.full_text, source.summary, ...(source.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasLowValue(text) {
  return LOW_VALUE_SIGNALS.some((s) => text.includes(s));
}

// ── Component scorers ────────────────────────────────────────────────────────

function scoreAiSpecificity(source) {
  if (typeof source.ai_specificity_score !== "number") {
    // Fallback when classification hasn't run yet
    return clamp(CATEGORY_BASE_RELEVANCE[source.main_category] || 4, 0, 20);
  }

  // Scale 0–100 → 0–17, then add a category bonus for the most impactful domains
  let score = Math.round((source.ai_specificity_score / 100) * 17);

  const cat = source.main_category;
  if (cat === "agentic_ai_threats" || cat === "ai_enabled_threats") score += 3;
  else if (cat === "llm_threats") score += 2;
  else if (cat === "traditional_ai_threats") score += 1;

  if (cat === "uncategorised") score = Math.min(score, 4);

  return clamp(score, 0, 20);
}

function scoreSeverity(source, text) {
  // Scores concrete threat signals: exploitation status, CVE presence,
  // RCE capability, named actors, and quantified impact.
  // Does NOT score sentiment words like "critical" or "breach".
  const tags = new Set(source.tags || []);
  let score = 0;

  // Confirmed active exploitation — strongest signal
  if (tags.has("actively_exploited")) score += 10;
  else if (/actively exploited|exploited in the wild|zero-day exploit/i.test(text)) score += 8;

  // RCE is inherently severe
  if (/\brce\b|remote code execution|execute arbitrary code/i.test(text)) score += 7;

  // PoC raises practical exploitability
  if (tags.has("proof_of_concept")) score += 4;
  else if (/proof.of.concept|exploit code released|public exploit available/i.test(text)) score += 3;

  // Named CVE identifiers — specific and verifiable
  const cveCount = (text.match(/cve-\d{4}-\d+/gi) || []).length;
  score += Math.min(cveCount * 2, 5);

  // Named threat actors in LLM-extracted intelligence — attributed campaign
  const actors = source.intelligence?.key_entities?.threat_actors || [];
  score += Math.min(actors.length * 2, 4);

  // Quantified real-world impact (N million/thousand users/records)
  if (/\b\d[\d,.]+\s*(million|billion)\s+(users|accounts|records|devices|victims)/i.test(text)) score += 4;
  else if (/\b\d[\d,.]+\s*(thousand|hundred thousand)\s+(users|accounts|records)/i.test(text)) score += 2;

  // High-severity tags
  for (const tag of HIGH_SEVERITY_TAGS) {
    if (tags.has(tag) && tag !== "actively_exploited" && tag !== "proof_of_concept") {
      score += 2;
    }
  }
  for (const tag of ELEVATED_SEVERITY_TAGS) {
    if (tags.has(tag)) score += 1;
  }

  return clamp(score, 0, 20);
}

function scoreOperationalActionability(source, text) {
  // Rewards content analysts can act on: patches, IOCs, watch points, affected product names.
  const tags = new Set(source.tags || []);
  let score = 0;

  // IOC/detection artifacts — analysts can implement detections immediately
  if (IOC_SIGNALS.some((s) => text.includes(s))) score += 6;

  // LLM-extracted watch points — the model identified specific things to monitor
  const watchPoints = source.analyst_brief?.watch_points || [];
  if (watchPoints.length >= 3) score += 5;
  else if (watchPoints.length > 0) score += 3;

  // Named affected products — analysts can check their exposure
  const products = source.intelligence?.key_entities?.affected_products || [];
  if (products.length >= 3) score += 4;
  else if (products.length > 0) score += 2;

  // Government or vendor advisory — typically carries authoritative guidance
  if (source.source_type === "government_advisory") score += 4;
  else if (source.source_type === "vendor_advisory") score += 3;

  // Patch or mitigation confirmed available
  if (/patch (available|released|applied)|mitigation (available|published)/i.test(text)) score += 3;

  // Critical sector exposure
  if (tags.has("critical_infrastructure")) score += 3;

  if (hasLowValue(text)) score -= 5;

  return clamp(score, 0, 20);
}

function scoreInformationDensity(source, text) {
  // Rewards fact-rich, evidence-backed content over opinion and summaries.
  let score = 0;

  // Source type — structural proxy for information quality
  if (source.source_type === "research_paper") score += 6;
  else if (source.source_type === "threat_intel") score += 5;
  else if (source.source_type === "government_advisory") score += 4;
  else if (source.source_type === "vendor_advisory") score += 3;
  else if (source.source_type === "security_blog") score += 1;

  // LLM-extracted factual content
  const intel = source.intelligence || {};
  const cveList = intel.key_entities?.cves || [];
  score += Math.min(cveList.length * 2, 4);

  const actorList = intel.key_entities?.threat_actors || [];
  if (actorList.length > 0) score += 2;

  const trendSignals = intel.trend_signals || [];
  score += Math.min(trendSignals.length, 3);

  // Named CVEs in raw text
  const cveInText = (text.match(/cve-\d{4}-\d+/gi) || []).length;
  score += Math.min(cveInText, 3);

  // Quantified claims (specific numbers, not just "many")
  const quantMatches = (text.match(
    /\b\d[\d,.]*\s*(million|billion|thousand|percent|%|users|records|devices|organizations)/gi
  ) || []).length;
  score += Math.min(quantMatches, 3);

  // Claims extracted by LLM = verified fact density
  const claims = source.claims || [];
  if (claims.length >= 5) score += 3;
  else if (claims.length >= 2) score += 1;

  if (hasLowValue(text)) score -= 4;

  return clamp(score, 0, 15);
}

function scoreSourceCredibility(source) {
  const tier = source.trust_tier || "unknown";
  return CREDIBILITY_BY_TIER[tier] ?? 2;
}

const SINGAPORE_TERMS = [
  "singapore", "csa singapore", "imda", "govtech", "asean",
  "southeast asia", "south-east asia", "critical information infrastructure",
];

function scoreSingaporeRelevance(source, text) {
  const matches = SINGAPORE_TERMS.filter((t) => text.includes(t)).length;
  let score = matches * 3;
  if ((source.tags || []).includes("critical_infrastructure")) score += 2;
  return clamp(score, 0, 10);
}

function scoreTimeSensitivity(source) {
  // Based on publication recency and confirmed exploitation — not keyword matching.
  let score = 0;

  const tags = new Set(source.tags || []);
  if (tags.has("actively_exploited")) score += 3;

  const published = source.date_published ? new Date(source.date_published) : null;
  if (published && !Number.isNaN(published.getTime())) {
    const ageHours = (Date.now() - published.getTime()) / 3_600_000;
    if (ageHours <= 24) score += 5;
    else if (ageHours <= 72) score += 3;
    else if (ageHours <= 168) score += 1;
  }

  return clamp(score, 0, 5);
}

function scoreReportQuality(source, text) {
  // Measures strategic and intelligence value for published reports.
  let score = 0;

  const intel = source.intelligence || {};

  // Horizon relevance (1–5) directly reflects forward-looking importance
  const hr = intel.horizon_relevance || 0;
  score += hr * 2;

  // Trend signals = forward-looking intelligence
  const trendSignals = intel.trend_signals || [];
  score += Math.min(trendSignals.length * 2, 6);

  // Threat maturity informs report placement
  if (intel.threat_maturity === "emerging") score += 4;
  else if (intel.threat_maturity === "growing") score += 2;

  // Named entities enrich report content
  const actors = intel.key_entities?.threat_actors || [];
  if (actors.length > 0) score += 2;
  const cves = intel.key_entities?.cves || [];
  score += Math.min(cves.length, 3);

  // Analyst brief completeness (each substantive field = more usable content)
  const brief = source.analyst_brief || {};
  const filledFields = ["what_happened", "who_was_affected", "how_it_happened", "impact", "why_it_matters"]
    .filter((k) => (brief[k] || "").length > 40).length;
  score += filledFields;

  // Source type quality for strategic reports
  if (source.source_type === "research_paper") score += 4;
  else if (source.source_type === "threat_intel") score += 3;
  else if (source.source_type === "government_advisory") score += 2;

  if (hasLowValue(text)) score -= 6;

  return clamp(score, 0, 25);
}

function scoreHorizonSignal(source) {
  const intel = source.intelligence || {};
  let score = 0;

  if (intel.threat_maturity === "emerging") score += 8;
  else if (intel.threat_maturity === "growing") score += 5;

  score += (intel.horizon_relevance || 0) * 2;

  if (intel.report_tier === "weekly") score += 4;
  else if (intel.report_tier === "monthly") score += 2;

  return clamp(score, 0, 20);
}

// ── Priority label ───────────────────────────────────────────────────────────

function priorityLabel(score) {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  if (score >= 25) return "low";
  return "background";
}

function buildReason(scores, source) {
  const reasons = [];
  if (scores.severity_score >= 10) reasons.push("concrete severity signals");
  if (scores.operational_impact_score >= 12) reasons.push("operationally actionable");
  if (scores.singapore_relevance_score >= 5) reasons.push("Singapore/ASEAN relevance");
  if (scores.source_credibility_score >= 8) reasons.push("credible source");
  if (scores.novelty_score >= 10) reasons.push("information-dense content");
  const tags = (source.tags || []).filter((t) => !["vulnerability", "research"].includes(t));
  if (tags.length > 0) reasons.push(`tags: ${tags.slice(0, 5).join(", ")}`);
  return reasons.join("; ") || "Low signal or background relevance.";
}

// ── Main export ──────────────────────────────────────────────────────────────

export function scoreSource(source) {
  const text = textOf(source);

  const scores = {
    ai_security_relevance: scoreAiSpecificity(source),
    severity_score: scoreSeverity(source, text),
    operational_impact_score: scoreOperationalActionability(source, text),
    novelty_score: scoreInformationDensity(source, text),   // column name kept for DB compat
    source_credibility_score: scoreSourceCredibility(source),
    singapore_relevance_score: scoreSingaporeRelevance(source, text),
    time_sensitivity_score: scoreTimeSensitivity(source),
    report_quality_score: scoreReportQuality(source, text),
    horizon_signal_score: scoreHorizonSignal(source),
  };

  // Cap severity contribution for uncategorised sources so generic CVEs
  // don't outrank AI-focused content with lower raw severity numbers.
  const effectiveSeverity =
    source.main_category === "uncategorised"
      ? Math.min(scores.severity_score, 8)
      : scores.severity_score;

  const priority_score =
    scores.ai_security_relevance +
    effectiveSeverity +
    scores.operational_impact_score +
    scores.novelty_score +
    scores.source_credibility_score +
    scores.singapore_relevance_score +
    scores.time_sensitivity_score;

  const report_score =
    scores.ai_security_relevance +
    scores.report_quality_score +
    scores.horizon_signal_score +
    scores.source_credibility_score +
    scores.novelty_score;

  return {
    ...source,
    ...scores,
    priority_score,
    priority_label: priorityLabel(priority_score),
    priority_reason: buildReason(scores, source),
    report_score,
    score_version: SCORE_VERSION,
  };
}
