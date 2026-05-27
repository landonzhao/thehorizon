/**
 * Layer 6 — Main Category Classification
 *
 * Assigns exactly one main_category to each source using the category_candidates
 * and framework_tags produced by Layer 5 (taxonomy). This is a deterministic
 * step — no LLM required. The LLM's work was done in Layer 5; Layer 6 just
 * picks the winner.
 *
 * Decision logic (highest to lowest priority):
 *   1. If any candidate has confidence "high" → pick the first (highest framework_tag support).
 *   2. If multiple candidates have confidence "medium" → pick by supporting_tags count.
 *   3. If only "low" confidence candidates exist → pick by supporting_tags count.
 *   4. If no candidates exist → unclear_or_adjacent.
 *
 * Output fields added to source:
 *   source.main_category           — one of CLASSIFIABLE_CATEGORIES
 *   source.classification_confidence — high | medium | low | none
 *   source.classify_version        — idempotency stamp
 *
 * Idempotent: sources already stamped with CLASSIFY_VERSION are skipped.
 */

import { CLASSIFIABLE_CATEGORIES } from "../../config/categories.js";

export const CLASSIFY_VERSION = "classify-v6.0";

// Confidence tier ordering for comparison
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Pick the best candidate from an array of category_candidates.
 *
 * @param {object[]} candidates
 * @returns {{ category: string, confidence: string } | null}
 */
function pickBestCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const valid = candidates.filter((c) => CLASSIFIABLE_CATEGORIES.includes(c.category));
  if (valid.length === 0) return null;

  // Sort: higher confidence tier first, then more supporting_tags, then original order
  const sorted = [...valid].sort((a, b) => {
    const rankDiff = (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0);
    if (rankDiff !== 0) return rankDiff;
    return (b.supporting_tags?.length || 0) - (a.supporting_tags?.length || 0);
  });

  return { category: sorted[0].category, confidence: sorted[0].confidence };
}

/**
 * Derive a classification confidence from framework_tag evidence when
 * category_candidates are absent or uninformative.
 *
 * @param {object[]} frameworkTags
 * @returns {{ category: string, confidence: string } | null}
 */
function pickFromFrameworkTags(frameworkTags) {
  if (!Array.isArray(frameworkTags) || frameworkTags.length === 0) return null;

  const counts = {};
  let highestConfidence = {};

  for (const tag of frameworkTags) {
    const cat = tag.category_candidate;
    if (!cat || !CLASSIFIABLE_CATEGORIES.includes(cat)) continue;
    counts[cat] = (counts[cat] || 0) + 1;

    const rank = CONFIDENCE_RANK[tag.confidence] || 1;
    if (!highestConfidence[cat] || rank > highestConfidence[cat]) {
      highestConfidence[cat] = rank;
    }
  }

  if (Object.keys(counts).length === 0) return null;

  // Sort by: count of tags, then max tag confidence
  const best = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (highestConfidence[b[0]] || 0) - (highestConfidence[a[0]] || 0);
  })[0];

  const confRank = highestConfidence[best[0]] || 1;
  const confidence = confRank >= 3 ? "high" : confRank >= 2 ? "medium" : "low";

  return { category: best[0], confidence };
}

/**
 * Classify a single source into exactly one main_category.
 *
 * @param {object} source - Source with `understanding.category_candidates`,
 *   `understanding.framework_tags`, and `understanding.attack_mappings` set by Layer 5.
 * @returns {object} Source with `main_category`, `classification_confidence`,
 *   `classify_version` added.
 */
export function classifySource(source) {
  if (source.classify_version === CLASSIFY_VERSION) return source;

  const candidates    = source.understanding?.category_candidates || [];
  const frameworkTags = source.understanding?.framework_tags || [];
  // attack_mappings entries have category_hint on the registry — synthesize as fake frameworkTags
  const attackMappings = (source.understanding?.attack_mappings || []).map((am) => ({
    tag:               am.tag,
    category_candidate: "ai_enabled_threats", // all ATT&CK entries hint ai_enabled_threats
    confidence:         am.confidence,
  }));

  // Priority 1: use category_candidates from LLM
  let pick = pickBestCandidate(candidates);

  // Priority 2: fall back to framework_tags if candidates empty or all low-confidence
  if (!pick || pick.confidence === "low") {
    const tagPick = pickFromFrameworkTags(frameworkTags);
    if (tagPick && CONFIDENCE_RANK[tagPick.confidence] > CONFIDENCE_RANK[pick?.confidence || "low"]) {
      pick = tagPick;
    }
  }

  // Priority 3: fall back to attack_mappings (all map to ai_enabled_threats)
  if (!pick || pick.confidence === "low") {
    const attackPick = pickFromFrameworkTags(attackMappings);
    if (attackPick && CONFIDENCE_RANK[attackPick.confidence] > CONFIDENCE_RANK[pick?.confidence || "low"]) {
      pick = attackPick;
    }
  }

  // Priority 4: preserve existing DB main_category if it's a known offensive category
  // and we have no confident classification from Layer 5 (avoids downgrading
  // previously LLM-enriched sources to unclear_or_adjacent on a re-run without LLM).
  if (
    (!pick || pick.confidence === "low") &&
    source.main_category &&
    source.main_category !== "unclear_or_adjacent" &&
    source.main_category !== "uncategorised" &&
    source.main_category !== "ai_for_security" &&
    CLASSIFIABLE_CATEGORIES.includes(source.main_category) &&
    !source.understanding?.llm_used // only preserve when this Layer 5 run was fallback
  ) {
    return {
      ...source,
      main_category:           source.main_category,
      classification_confidence: "low",
      classify_version:        CLASSIFY_VERSION,
    };
  }

  const finalCategory = pick?.category || "unclear_or_adjacent";
  const finalConfidence = pick?.confidence || "none";

  return {
    ...source,
    main_category:           finalCategory,
    classification_confidence: finalConfidence,
    classify_version:        CLASSIFY_VERSION,
  };
}

/**
 * Classify a batch of sources.
 *
 * @param {object[]} sources - Sources processed by Layer 5 (understandSources).
 * @returns {{ sources: object[], counts: object }}
 */
export function classifySources(sources) {
  const results = sources.map(classifySource);

  const distribution = {};
  for (const s of results) {
    const cat = s.main_category || "unclear_or_adjacent";
    distribution[cat] = (distribution[cat] || 0) + 1;
  }

  const alreadyDone  = sources.filter((s) => s.classify_version === CLASSIFY_VERSION).length;
  const newlyDone    = results.length - alreadyDone;
  const highConf     = results.filter((s) => s.classification_confidence === "high").length;
  const medConf      = results.filter((s) => s.classification_confidence === "medium").length;
  const fallback     = results.filter((s) => s.main_category === "unclear_or_adjacent").length;

  return {
    sources: results,
    counts: {
      total:        sources.length,
      already_done: alreadyDone,
      newly_done:   newlyDone,
      high_conf:    highConf,
      medium_conf:  medConf,
      unclear:      fallback,
      distribution,
    },
  };
}
