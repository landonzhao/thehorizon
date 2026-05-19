import { isSafeUrl } from "./urlSafety.js";

export function checkSourceValidity(source) {
  let score = 50;
  const warnings = [];

  const trustTier = source.trust_tier || source.collection_metadata?.trust_tier;

  if (trustTier === "primary") score += 35;
  else if (trustTier === "high") score += 25;
  else if (trustTier === "medium") score += 10;
  else if (trustTier === "low") score -= 5;

  if (!source.title) {
    score -= 40;
    warnings.push("Missing title");
  }

  if (!source.url || !isSafeUrl(source.url)) {
    score -= 60;
    warnings.push("Missing or unsafe URL");
  }

  if (!source.publisher) {
    score -= 10;
    warnings.push("Missing publisher");
  }

  if (!source.date_published) {
    score -= 5;
    warnings.push("Missing publication date");
  }

  if (!source.full_text || source.full_text.length < 50) {
    score -= 5;
    warnings.push("Limited text available");
  }

  score = Math.max(0, Math.min(100, score));

  let label = "medium_trust";

  if (score >= 85) label = "primary";
  else if (score >= 75) label = "high_trust";
  else if (score >= 55) label = "medium_trust";
  else if (score >= 30) label = "low_trust";
  else label = "do_not_use";

  const usable =
    Boolean(source.title) &&
    Boolean(source.url) &&
    isSafeUrl(source.url) &&
    label !== "do_not_use";

  return {
    source_id: source.id,
    source_validity_score: score,
    credibility_label: label,
    trust_tier: trustTier || "unknown",
    warnings,
    usable,
  };
}

export function attachValidityToSources(sources) {
  return sources.map((source) => ({
    ...source,
    validity: checkSourceValidity(source),
  }));
}
