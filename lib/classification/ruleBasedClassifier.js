import { MAIN_CATEGORIES } from "./allowedTags.js";
import { PHRASE_RULES } from "./phraseRules.js";

function buildSearchText(source) {
  return [
    source.title,
    source.publisher,
    source.source_type,
    source.full_text,
    source.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function emptyCategorySignals() {
  return Object.fromEntries(MAIN_CATEGORIES.map((category) => [category, 0]));
}

export function classifySourceWithRules(source) {
  const text = buildSearchText(source);
  const tags = new Set(source.tags || []);
  const matched_phrases = [];
  const category_signals = emptyCategorySignals();

  for (const rule of PHRASE_RULES) {
    const hits = rule.phrases.filter((phrase) =>
      text.includes(phrase.toLowerCase())
    );

    if (hits.length > 0) {
      tags.add(rule.tag);
      category_signals[rule.category] += hits.length;

      matched_phrases.push({
        tag: rule.tag,
        category: rule.category,
        phrases: hits,
      });
    }
  }

  const ranked = Object.entries(category_signals)
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  return {
    ...source,
    tags: [...tags].sort(),
    rule_category: best?.score > 0 ? best.category : null,
    rule_category_confidence: best?.score > 0 ? Math.min(95, 40 + best.score * 15) : 0,
    rule_category_reason:
      best?.score > 0
        ? `Matched phrases: ${matched_phrases
            .filter((match) => match.category === best.category)
            .flatMap((match) => match.phrases)
            .slice(0, 8)
            .join(", ")}`
        : "No phrase rule matched.",
    tag_metadata: {
      category_signals,
      matched_phrases,
    },
  };
}
