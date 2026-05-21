import { MAIN_CATEGORIES } from "./allowedTags.js";
import { PHRASE_RULES } from "./phraseRules.js";

function buildSearchText(source) {
  // publisher is included because it catches org names (e.g., "Hugging Face")
  // source_type is excluded — underscore format won't match space-separated phrases
  return [
    source.title,
    source.publisher,
    source.full_text,
    source.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function emptyCategoryMap() {
  return Object.fromEntries(MAIN_CATEGORIES.map((c) => [c, 0]));
}

export function classifySourceWithRules(source) {
  const text = buildSearchText(source);
  const tags = new Set(source.tags || []);
  const matched_phrases = [];

  // category_signals: weighted by ai_weight (used for category ranking)
  // category_hits: raw match count (used for confidence — same as before ai_weight)
  const category_signals = emptyCategoryMap();
  const category_hits    = emptyCategoryMap();

  for (const rule of PHRASE_RULES) {
    const hits = rule.phrases.filter((phrase) =>
      text.includes(phrase.toLowerCase())
    );

    if (hits.length > 0) {
      tags.add(rule.tag);
      if (rule.category && rule.category in category_signals) {
        // Weight by ai_weight so high-priority signals dominate category selection
        category_signals[rule.category] += hits.length * (rule.ai_weight || 1);
        category_hits[rule.category]    += hits.length;
      }
      matched_phrases.push({
        tag:      rule.tag,
        category: rule.category,
        phrases:  hits,
      });
    }
  }

  const ranked = Object.entries(category_signals)
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  // Confidence based on hit count (not weighted score) to keep units intuitive
  const bestHits = best?.score > 0 ? (category_hits[best.category] || 1) : 0;
  const confidence = bestHits === 0 ? 0 : Math.min(90, 40 + bestHits * 12);

  return {
    ...source,
    tags: [...tags].sort(),
    rule_category:            best?.score > 0 ? best.category : null,
    rule_category_confidence: confidence,
    rule_category_reason:
      best?.score > 0
        ? `Matched phrases: ${matched_phrases
            .filter((m) => m.category === best.category)
            .flatMap((m) => m.phrases)
            .slice(0, 8)
            .join(", ")}`
        : "No phrase rule matched.",
    tag_metadata: {
      category_signals,
      category_hits,
      matched_phrases,
    },
  };
}
