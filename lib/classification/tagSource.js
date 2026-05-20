import { TAG_DEFINITIONS, TAG_VERSION } from "./tagDefinitions.js";

function buildSearchText(source) {
  return [
    source.title,
    source.publisher,
    source.source_type,
    source.full_text,
    source.summary,
    source.short_summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normaliseTag(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function publisherTag(source) {
  if (!source.publisher) return null;
  return `publisher:${normaliseTag(source.publisher)}`;
}

export function tagSource(source) {
  const text = buildSearchText(source);
  const tags = new Set();
  const matched_phrases = [];
  const category_signals = {};

  for (const rule of TAG_DEFINITIONS) {
    const hits = rule.phrases.filter((phrase) => text.includes(phrase.toLowerCase()));

    if (hits.length > 0) {
      tags.add(rule.tag);

      if (rule.category) {
        category_signals[rule.category] =
          (category_signals[rule.category] || 0) + hits.length;
      }

      matched_phrases.push({
        tag: rule.tag,
        category: rule.category,
        phrases: hits,
        ai_weight: rule.ai_weight,
      });
    }
  }

  if (source.source_type) tags.add(normaliseTag(source.source_type));

  const pubTag = publisherTag(source);
  if (pubTag) tags.add(pubTag);

  return {
    ...source,
    tags: [...tags].sort(),
    tag_version: TAG_VERSION,
    tag_metadata: {
      matched_phrases,
      category_signals,
    },
  };
}
