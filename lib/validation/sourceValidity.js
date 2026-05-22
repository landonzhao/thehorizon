import { isSafeUrl, isUrlReachable } from "./urlSafety.js";

export async function checkSourceValidity(source) {
  const trustTier = source.trust_tier || source.collection_metadata?.trust_tier;

  // ── Hard gates: reject immediately, no scoring ────────────────────────────
  if (!source.title?.trim()) {
    return {
      source_id: source.id,
      source_validity_score: 0,
      credibility_label: "do_not_use",
      trust_tier: trustTier || "unknown",
      warnings: ["Missing title"],
      usable: false,
      url_reachable: null,
    };
  }

  if (!source.url || !isSafeUrl(source.url)) {
    return {
      source_id: source.id,
      source_validity_score: 0,
      credibility_label: "do_not_use",
      trust_tier: trustTier || "unknown",
      warnings: ["Missing or unsafe URL"],
      usable: false,
      url_reachable: null,
    };
  }

  // ── Scoring (title and safe URL confirmed present) ────────────────────────
  let score = 50;
  const warnings = [];

  if (trustTier === "primary")       score += 35;
  else if (trustTier === "high")     score += 25;
  else if (trustTier === "curated")  score += 25; // manually vetted — treat same as high
  else if (trustTier === "medium")   score += 10;
  else if (trustTier === "low")      score -= 5;
  // "unknown" gets no adjustment — scored on data quality alone

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

  // ── URL reachability: soft penalty on confirmed failure ───────────────────
  const url_reachable = await isUrlReachable(source.url);
  if (url_reachable === false) {
    score -= 10;
    warnings.push("URL returned error response");
  }

  score = Math.max(0, Math.min(100, score));

  let label;
  if (score >= 85)      label = "primary";
  else if (score >= 75) label = "high_trust";
  else if (score >= 55) label = "medium_trust";
  else if (score >= 30) label = "low_trust";
  else                  label = "do_not_use";

  return {
    source_id: source.id,
    source_validity_score: score,
    credibility_label: label,
    trust_tier: trustTier || "unknown",
    warnings,
    usable: label !== "do_not_use",
    url_reachable,
  };
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function attachValidityToSources(sources) {
  const validities = await runWithConcurrency(
    sources.map((source) => () => checkSourceValidity(source)),
    20  // cap simultaneous HEAD requests
  );
  return sources.map((source, i) => ({ ...source, validity: validities[i] }));
}
