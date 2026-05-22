import { TAG_DEFINITIONS } from "./tagDefinitions.js";
import { MAIN_CATEGORIES } from "./allowedTags.js";
import { HIGH_SEVERITY_TAGS, ELEVATED_SEVERITY_TAGS } from "../scoring/relevanceRules.js";

// Ordered severity list used for tie-breaking.
// Tags that appear earlier have higher priority.
const SEVERITY_PRIORITY = [...HIGH_SEVERITY_TAGS, ...ELEVATED_SEVERITY_TAGS];

// Pre-built lookup: tag → category (null for context tags)
const TAG_TO_CATEGORY = new Map(
  TAG_DEFINITIONS.map((d) => [d.tag, d.category])
);

/**
 * Derive a main_category from a list of already-assigned tags.
 *
 * Algorithm:
 *   1. Count threat tags (non-null category) per category.
 *   2. Pick the category with the highest count.
 *   3. If tied, the tag with the highest position in the severity list
 *      (HIGH_SEVERITY_TAGS then ELEVATED_SEVERITY_TAGS) determines the category.
 *   4. If no threat tags at all, return "uncategorised".
 *
 * @param {string[]} tags — tags from ALLOWED_TAGS, already validated
 * @returns {{ main_category: string, category_confidence: number, category_reason: string }}
 */
export function deriveCategory(tags = []) {
  // Count threat tags per category (skip context tags with null category)
  const counts = Object.fromEntries(MAIN_CATEGORIES.map((c) => [c, 0]));
  const tagsByCategory = Object.fromEntries(MAIN_CATEGORIES.map((c) => [c, []]));

  for (const tag of tags) {
    const cat = TAG_TO_CATEGORY.get(tag);
    if (cat && cat in counts) {
      counts[cat]++;
      tagsByCategory[cat].push(tag);
    }
  }

  const totalThreatTags = MAIN_CATEGORIES.reduce((sum, c) => sum + counts[c], 0);

  if (totalThreatTags === 0) {
    return {
      main_category: "uncategorised",
      category_confidence: 0,
      category_reason: "No threat-specific tags assigned — source may cover AI tangentially.",
    };
  }

  // Sort categories by hit count (descending)
  const ranked = MAIN_CATEGORIES
    .map((c) => ({ category: c, count: counts[c] }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  // Check for tie at the top
  const topCount = ranked[0].count;
  const tied = ranked.filter((e) => e.count === topCount);

  let bestCategory;
  if (tied.length === 1) {
    bestCategory = tied[0].category;
  } else {
    // Tie-break: find the highest-severity tag whose category is among the tied ones
    const tiedCatSet = new Set(tied.map((e) => e.category));
    let resolved = null;

    for (const sevTag of SEVERITY_PRIORITY) {
      if (!tags.includes(sevTag)) continue;
      const cat = TAG_TO_CATEGORY.get(sevTag);
      if (cat && tiedCatSet.has(cat)) {
        resolved = cat;
        break;
      }
    }

    bestCategory = resolved || tied[0].category;
  }

  const bestCount = counts[bestCategory];
  const dominance = bestCount / totalThreatTags;

  // Confidence: weighted by both dominance and tag count.
  // A single tag at 100% dominance scores ~84 — informative but not high-conviction.
  // 5+ aligned tags at 100% dominance reaches 100.
  const confidence = Math.min(100, Math.round(40 + dominance * 40 + Math.min(bestCount, 5) * 4));

  const winnerTags = tagsByCategory[bestCategory].join(", ");
  const otherCats = ranked
    .filter((e) => e.category !== bestCategory)
    .map((e) => `${e.category} (${e.count})`)
    .join(", ");

  const reason = otherCats
    ? `${bestCount}/${totalThreatTags} threat tags are in ${bestCategory} [${winnerTags}]; also signals: ${otherCats}.`
    : `All ${bestCount} threat tag${bestCount > 1 ? "s" : ""} are in ${bestCategory} [${winnerTags}].`;

  return {
    main_category: bestCategory,
    category_confidence: Math.min(100, confidence),
    category_reason: reason,
  };
}
