import {
  SCORE_VERSION,
  HIGH_IMPACT_TAGS,
  MEDIUM_IMPACT_TAGS,
  LOW_VALUE_SIGNALS,
  ACTIONABLE_TERMS,
  SINGAPORE_TERMS,
  CREDIBILITY_BY_TIER,
  CATEGORY_BASE_RELEVANCE,
} from "./relevanceRules.js";

function textOf(source) {
  return [
    source.title,
    source.publisher,
    source.source_type,
    source.main_category,
    source.full_text,
    source.summary,
    ...(source.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countMatches(text, terms) {
  return terms.filter((term) => text.includes(term)).length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTrustTier(source) {
  return source.trust_tier || "unknown";
}

function scoreAiSecurityRelevance(source, text) {
  let score = CATEGORY_BASE_RELEVANCE[source.main_category] || 8;

  const tags = new Set(source.tags || []);

  if (tags.has("vulnerability") || tags.has("cve")) score += 3;
  if (tags.has("threat_intelligence")) score += 3;
  if (tags.has("research")) score += 1;
  if (source.source_type === "security_blog") score += 1;
  if (source.source_type === "policy_update") score -= 2;

  if (countMatches(text, ["ai", "llm", "agent", "deepfake", "machine learning"]) === 0) {
    score -= 6;
  }

  return clamp(score, 0, 20);
}

function scoreSeverity(source, text) {
  const tags = new Set(source.tags || []);
  let score = 0;

  for (const tag of HIGH_IMPACT_TAGS) {
    if (tags.has(tag)) score += 4;
  }

  for (const tag of MEDIUM_IMPACT_TAGS) {
    if (tags.has(tag)) score += 2;
  }

  if (text.includes("critical")) score += 4;
  if (text.includes("actively exploited") || text.includes("in the wild")) score += 5;
  if (text.includes("data breach") || text.includes("breach")) score += 4;
  if (text.includes("remote code execution") || text.includes("rce")) score += 5;
  if (text.includes("privilege escalation")) score += 3;
  if (text.includes("credential")) score += 3;

  return clamp(score, 0, 20);
}

function scoreOperationalImpact(source, text) {
  let score = 0;

  if (countMatches(text, ACTIONABLE_TERMS) > 0) score += 6;
  if (text.includes("patch") || text.includes("mitigation")) score += 4;
  if (text.includes("detection") || text.includes("indicator") || text.includes("ioc")) score += 4;
  if (text.includes("enterprise") || text.includes("organization")) score += 3;
  if (text.includes("government") || text.includes("critical infrastructure")) score += 4;
  if (text.includes("financial") || text.includes("bank")) score += 3;

  if (LOW_VALUE_SIGNALS.some((signal) => text.includes(signal))) {
    score -= 5;
  }

  return clamp(score, 0, 20);
}

function scoreNovelty(source, text) {
  let score = 6;

  if (text.includes("new") || text.includes("novel") || text.includes("first observed")) score += 4;
  if (text.includes("emerging") || text.includes("newly discovered")) score += 4;
  if (text.includes("researchers found") || text.includes("discovered")) score += 3;
  if (source.source_type === "research_paper") score += 3;
  if (source.source_type === "vulnerability_database") score += 2;

  if (text.includes("overview") || text.includes("recap")) score -= 3;
  if (text.includes("opinion")) score -= 3;

  return clamp(score, 0, 15);
}

function scoreSourceCredibility(source) {
  const tier = getTrustTier(source);
  return CREDIBILITY_BY_TIER[tier] ?? 2;
}

function scoreSingaporeRelevance(source, text) {
  let score = 0;

  const matches = countMatches(text, SINGAPORE_TERMS);
  score += matches * 3;

  if ((source.tags || []).includes("singapore_relevance")) score += 4;
  if ((source.tags || []).includes("asean_relevance")) score += 2;
  if ((source.tags || []).includes("financial_sector")) score += 2;
  if ((source.tags || []).includes("government_sector")) score += 2;
  if ((source.tags || []).includes("critical_infrastructure")) score += 2;

  return clamp(score, 0, 10);
}

function scoreTimeSensitivity(source, text) {
  let score = 0;

  if (text.includes("actively exploited") || text.includes("in the wild")) score += 5;
  else if (text.includes("patch") || text.includes("advisory") || text.includes("cve")) score += 3;
  else if (text.includes("new") || text.includes("latest")) score += 2;

  return clamp(score, 0, 5);
}

function priorityLabel(score) {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  if (score >= 35) return "low";
  return "background";
}

function buildReason(scores, source) {
  const reasons = [];

  if (scores.severity_score >= 14) reasons.push("high severity indicators");
  if (scores.operational_impact_score >= 14) reasons.push("operationally actionable");
  if (scores.singapore_relevance_score >= 5) reasons.push("Singapore/ASEAN relevance");
  if (scores.source_credibility_score >= 8) reasons.push("credible source");
  if (scores.novelty_score >= 10) reasons.push("novel or emerging development");
  if ((source.tags || []).length > 0) reasons.push(`matched tags: ${(source.tags || []).slice(0, 6).join(", ")}`);

  return reasons.join("; ") || "Low signal or background relevance.";
}

export function scoreSource(source) {
  const text = textOf(source);

  const scores = {
    ai_security_relevance: scoreAiSecurityRelevance(source, text),
    severity_score: scoreSeverity(source, text),
    operational_impact_score: scoreOperationalImpact(source, text),
    novelty_score: scoreNovelty(source, text),
    source_credibility_score: scoreSourceCredibility(source),
    singapore_relevance_score: scoreSingaporeRelevance(source, text),
    time_sensitivity_score: scoreTimeSensitivity(source, text),
  };

  const priority_score =
    scores.ai_security_relevance +
    scores.severity_score +
    scores.operational_impact_score +
    scores.novelty_score +
    scores.source_credibility_score +
    scores.singapore_relevance_score +
    scores.time_sensitivity_score;

  return {
    ...source,
    ...scores,
    priority_score,
    priority_label: priorityLabel(priority_score),
    priority_reason: buildReason(scores, source),
    score_version: SCORE_VERSION,
  };
}
