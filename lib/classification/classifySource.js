import { tagSourceAdvanced } from "./tagSourceAdvanced.js";
import { TAG_VERSION } from "./taxonomy.js";

const CATEGORY_PRIORITY = [
  "agentic_ai_threats",
  "llm_threats",
  "ai_enabled_threats",
  "traditional_ai_threats",
  "ai_for_security",
];

export function classifySource(source) {
  const tagged = tagSourceAdvanced(source);
  const signals = tagged.tag_metadata?.category_signals || {};

  const ranked = Object.entries(signals)
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category);
    });

  const best = ranked[0];

  if (!best || best.score === 0) {
    return {
      ...tagged,
      main_category: "llm_threats",
      category_confidence: 25,
      category_reason: "No strong phrase match. Defaulted for review.",
      tag_version: TAG_VERSION,
    };
  }

  const phraseMatches = tagged.tag_metadata.matched_phrases
    .filter((match) => match.category_hint === best.category)
    .flatMap((match) => match.phrases)
    .slice(0, 5);

  return {
    ...tagged,
    main_category: best.category,
    category_confidence: Math.min(95, 40 + best.score * 15),
    category_reason: `Matched phrases: ${phraseMatches.join(", ")}`,
    tag_version: TAG_VERSION,
  };
}
