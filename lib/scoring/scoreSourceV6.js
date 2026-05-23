import {
  SCORE_VERSION_V6,
  HIGH_SEVERITY_TAGS,
  ELEVATED_SEVERITY_TAGS,
  LOW_VALUE_SIGNALS,
  IOC_SIGNALS,
  CREDIBILITY_BY_TIER,
  CATEGORY_BASE_RELEVANCE,
  EVENT_TYPE_CAPS,
  SINGAPORE_TERMS_V6,
  EVIDENCE_LEVEL_SCORES,
  PUBLISHER_CREDIBILITY_V6,
} from "./relevanceRules.js";
import { getProfile, applyDelta } from "./scoringProfiles.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

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

// ── Component scorers ─────────────────────────────────────────────────────────

function scoreAiSpecificity(source) {
  if (typeof source.ai_specificity_score !== "number") {
    return clamp(CATEGORY_BASE_RELEVANCE[source.main_category] || 4, 0, 20);
  }
  let score = Math.round((source.ai_specificity_score / 100) * 17);
  const cat = source.main_category;
  if (cat === "agentic_ai_threats" || cat === "ai_enabled_threats") score += 3;
  else if (cat === "llm_threats") score += 2;
  else if (cat === "traditional_ai_threats") score += 1;
  if (cat === "uncategorised") score = Math.min(score, 4);
  return clamp(score, 0, 20);
}

// V6: uses LLM-extracted evidence_level and exploitation_status as primary signals.
// Falls back to tag/text patterns when intel is absent.
function scoreSeverityV6(source, text, intel) {
  const tags = new Set(source.tags || []);
  let score = 0;

  if (intel) {
    // Primary: evidence_level from LLM extraction
    const evidenceScore = EVIDENCE_LEVEL_SCORES[intel.evidence_level] || 0;
    score += evidenceScore;

    // Additional bonus if exploitation_status confirms in-the-wild use
    if (intel.exploitation_status === "exploited_in_wild" && intel.evidence_level !== "confirmed_exploitation") {
      score += 5;
    }
  } else {
    // v5 fallback
    if (tags.has("actively_exploited")) score += 10;
    else if (/actively exploited|exploited in the wild|zero-day exploit/i.test(text)) score += 8;
    if (tags.has("proof_of_concept")) score += 4;
    else if (/proof.of.concept|exploit code released/i.test(text)) score += 3;
  }

  // Always scored: RCE capability, CVEs, threat actors
  if (/\brce\b|remote code execution|execute arbitrary code/i.test(text)) score += 5;

  const cveCount = (text.match(/cve-\d{4}-\d+/gi) || []).length;
  score += Math.min(cveCount * 2, 5);

  const actors = source.intelligence?.key_entities?.threat_actors || [];
  score += Math.min(actors.length * 2, 4);

  if (/\b\d[\d,.]+\s*(million|billion)\s+(users|accounts|records|devices|victims)/i.test(text)) score += 4;
  else if (/\b\d[\d,.]+\s*(thousand|hundred thousand)\s+(users|accounts|records)/i.test(text)) score += 2;

  for (const tag of HIGH_SEVERITY_TAGS) {
    if (tags.has(tag) && tag !== "actively_exploited" && tag !== "proof_of_concept") score += 2;
  }
  for (const tag of ELEVATED_SEVERITY_TAGS) {
    if (tags.has(tag)) score += 1;
  }

  if (source.main_category === "uncategorised") score = Math.min(score, 8);

  return clamp(score, 0, 20);
}

function scoreOperationalActionability(source, text) {
  const tags = new Set(source.tags || []);
  let score = 0;

  if (IOC_SIGNALS.some((s) => text.includes(s))) score += 6;

  const watchPoints = source.analyst_brief?.watch_points || [];
  if (watchPoints.length >= 3) score += 5;
  else if (watchPoints.length > 0) score += 3;

  const products = source.intelligence?.key_entities?.affected_products || [];
  if (products.length >= 3) score += 4;
  else if (products.length > 0) score += 2;

  if (source.source_type === "government_advisory") score += 4;
  else if (source.source_type === "vendor_advisory") score += 3;

  if (/patch (available|released|applied)|mitigation (available|published)/i.test(text)) score += 3;

  if (tags.has("critical_infrastructure")) score += 3;

  if (hasLowValue(text)) score -= 5;

  return clamp(score, 0, 20);
}

function scoreInformationDensity(source, text) {
  let score = 0;

  if (source.source_type === "research_paper") score += 6;
  else if (source.source_type === "threat_intel") score += 5;
  else if (source.source_type === "government_advisory") score += 4;
  else if (source.source_type === "vendor_advisory") score += 3;
  else if (source.source_type === "security_blog") score += 1;

  const intel = source.intelligence || {};
  const cveList = intel.key_entities?.cves || [];
  score += Math.min(cveList.length * 2, 4);

  const actorList = intel.key_entities?.threat_actors || [];
  if (actorList.length > 0) score += 2;

  const trendSignals = intel.trend_signals || [];
  score += Math.min(trendSignals.length, 3);

  const cveInText = (text.match(/cve-\d{4}-\d+/gi) || []).length;
  score += Math.min(cveInText, 3);

  const quantMatches = (text.match(
    /\b\d[\d,.]*\s*(million|billion|thousand|percent|%|users|records|devices|organizations)/gi
  ) || []).length;
  score += Math.min(quantMatches, 3);

  const claims = source.claims || [];
  if (claims.length >= 5) score += 3;
  else if (claims.length >= 2) score += 1;

  if (hasLowValue(text)) score -= 4;

  return clamp(score, 0, 15);
}

// V6: uses publisher_type from extracted intel as primary, trust_tier as supplement.
function scoreSourceCredibilityV6(source, intel) {
  let score = 0;

  if (intel?.publisher_type && PUBLISHER_CREDIBILITY_V6[intel.publisher_type] !== undefined) {
    score = PUBLISHER_CREDIBILITY_V6[intel.publisher_type];
  } else {
    // Fall back to trust_tier
    score = CREDIBILITY_BY_TIER[source.trust_tier || "unknown"] ?? 2;
  }

  // Trust tier as a secondary confirmation signal (average with publisher type score)
  if (intel?.publisher_type) {
    const tierScore = CREDIBILITY_BY_TIER[source.trust_tier || "unknown"] ?? 2;
    score = Math.round((score + tierScore) / 2);
  }

  return clamp(score, 0, 10);
}

function scoreSingaporeRelevanceV6(source, text) {
  const matches = SINGAPORE_TERMS_V6.filter((t) => text.includes(t)).length;
  let score = matches * 3;
  if ((source.tags || []).includes("critical_infrastructure")) score += 2;
  return clamp(score, 0, 10);
}

function scoreTimeSensitivity(source) {
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

function scoreReportQualityV6(source, text, intel) {
  let score = 0;
  const enrichIntel = source.intelligence || {};

  const hr = enrichIntel.horizon_relevance || 0;
  score += hr * 2;

  const trendSignals = enrichIntel.trend_signals || [];
  score += Math.min(trendSignals.length * 2, 6);

  if (enrichIntel.threat_maturity === "emerging") score += 4;
  else if (enrichIntel.threat_maturity === "growing") score += 2;

  const actors = enrichIntel.key_entities?.threat_actors || [];
  if (actors.length > 0) score += 2;
  const cves = enrichIntel.key_entities?.cves || [];
  score += Math.min(cves.length, 3);

  const brief = source.analyst_brief || {};
  const filledFields = ["what_happened", "who_was_affected", "how_it_happened", "impact", "why_it_matters"]
    .filter((k) => (brief[k] || "").length > 40).length;
  score += filledFields;

  if (source.source_type === "research_paper") score += 4;
  else if (source.source_type === "threat_intel") score += 3;
  else if (source.source_type === "government_advisory") score += 2;

  // V6 bonus: novel techniques carry more report value
  if (intel?.attack_novelty === "novel_technique") score += 4;
  else if (intel?.attack_novelty === "new_variant") score += 2;

  if (hasLowValue(text)) score -= 6;

  return clamp(score, 0, 25);
}

function scoreHorizonSignalV6(source, intel) {
  const enrichIntel = source.intelligence || {};
  let score = 0;

  if (enrichIntel.threat_maturity === "emerging") score += 8;
  else if (enrichIntel.threat_maturity === "growing") score += 5;

  score += (enrichIntel.horizon_relevance || 0) * 2;

  if (enrichIntel.report_tier === "weekly") score += 4;
  else if (enrichIntel.report_tier === "monthly") score += 2;

  // V6 bonus: novel technique boosts horizon signal
  if (intel?.attack_novelty === "novel_technique") score += 4;
  else if (intel?.attack_novelty === "new_variant") score += 2;

  return clamp(score, 0, 20);
}

// ── Priority label ────────────────────────────────────────────────────────────

function priorityLabel(score) {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  if (score >= 25) return "low";
  return "background";
}

function buildReason(scores, source, intel) {
  const reasons = [];
  if (scores.severity_score >= 10) reasons.push("concrete severity signals");
  if (scores.operational_impact_score >= 12) reasons.push("operationally actionable");
  if (scores.singapore_relevance_score >= 5) reasons.push("Singapore/ASEAN relevance");
  if (scores.source_credibility_score >= 8) reasons.push("credible source");
  if (scores.novelty_score >= 10) reasons.push("information-dense content");
  if (intel?.event_type) reasons.push(`type: ${intel.event_type}`);
  if (intel?.attack_novelty === "novel_technique") reasons.push("novel technique");
  const tags = (source.tags || []).filter((t) => !["vulnerability", "research"].includes(t));
  if (tags.length > 0) reasons.push(`tags: ${tags.slice(0, 5).join(", ")}`);
  return reasons.join("; ") || "Low signal or background relevance.";
}

// ── Main export ───────────────────────────────────────────────────────────────

export function scoreSourceV6(source) {
  const intel = source.llm_extracted_intelligence || null;
  const text = textOf(source);

  const rawScores = {
    ai_security_relevance:     scoreAiSpecificity(source),
    severity_score:            scoreSeverityV6(source, text, intel),
    operational_impact_score:  scoreOperationalActionability(source, text),
    novelty_score:             scoreInformationDensity(source, text),
    source_credibility_score:  scoreSourceCredibilityV6(source, intel),
    singapore_relevance_score: scoreSingaporeRelevanceV6(source, text),
    time_sensitivity_score:    scoreTimeSensitivity(source),
    report_quality_score:      scoreReportQualityV6(source, text, intel),
    horizon_signal_score:      scoreHorizonSignalV6(source, intel),
  };

  // Apply event-type profile deltas before summing
  const profile = getProfile(intel?.event_type);
  const scores = applyDelta(rawScores, profile);

  const caps = EVENT_TYPE_CAPS[intel?.event_type] || { priority_cap: 100, report_cap: 100 };

  const rawPriority =
    scores.ai_security_relevance +
    scores.severity_score +
    scores.operational_impact_score +
    scores.novelty_score +
    scores.source_credibility_score +
    scores.singapore_relevance_score +
    scores.time_sensitivity_score;

  const rawReport =
    scores.ai_security_relevance +
    scores.report_quality_score +
    scores.horizon_signal_score +
    scores.source_credibility_score +
    scores.novelty_score;

  const priority_score = Math.min(rawPriority, caps.priority_cap);
  const report_score   = Math.min(rawReport,   caps.report_cap);

  return {
    ...source,
    ...scores,
    priority_score,
    priority_label: priorityLabel(priority_score),
    priority_reason: buildReason(scores, source, intel),
    report_score,
    score_version: SCORE_VERSION_V6,
    publisher_type: intel?.publisher_type || source.publisher_type || null,
    event_type: intel?.event_type || source.event_type || null,
  };
}
