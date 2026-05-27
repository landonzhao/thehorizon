/**
 * Framework tag registry — category-organised view.
 *
 * This module re-exports the canonical registry from lib/config/taxonomyRegistry.js
 * and adds a secondary view organised by threat category, useful for lookups
 * during evidence extraction and analytics.
 *
 * Canonical source of truth: lib/config/taxonomyRegistry.js
 * Import that directly when you need validateTag / validateTags / buildTaxonomyContextForPrompt.
 */

export {
  TAXONOMY_REGISTRY,
  VALID_TAGS,
  VALID_FRAMEWORKS,
  validateTag,
  validateTags,
  buildTaxonomyContextForPrompt,
} from "../config/taxonomyRegistry.js";

import { TAXONOMY_REGISTRY } from "../config/taxonomyRegistry.js";

/**
 * Tags grouped by the threat category they most strongly signal.
 * Built from the `category_hint` field in the canonical registry.
 *
 * Shape:
 *   {
 *     traditional_ai_threats: { frameworks: [...], tags: [tagName, ...] },
 *     llm_threats:            { frameworks: [...], tags: [...] },
 *     agentic_ai_threats:     { frameworks: [...], tags: [...] },
 *     ai_enabled_threats:     { frameworks: [...], tags: [...] },
 *     cross_cutting:          { frameworks: [...], tags: [...] },  // category_hint: null
 *   }
 */
function buildCategoryView() {
  const buckets = {
    traditional_ai_threats: { frameworks: new Set(), tags: [] },
    llm_threats:            { frameworks: new Set(), tags: [] },
    agentic_ai_threats:     { frameworks: new Set(), tags: [] },
    ai_enabled_threats:     { frameworks: new Set(), tags: [] },
    cross_cutting:          { frameworks: new Set(), tags: [] },
  };

  for (const [tag, entry] of Object.entries(TAXONOMY_REGISTRY)) {
    const bucket = entry.category_hint ? buckets[entry.category_hint] : buckets.cross_cutting;
    if (!bucket) continue;
    bucket.tags.push(tag);
    bucket.frameworks.add(entry.framework);
  }

  // Convert Set → sorted Array
  const result = {};
  for (const [cat, bucket] of Object.entries(buckets)) {
    result[cat] = {
      frameworks: [...bucket.frameworks].sort(),
      tags: bucket.tags.sort(),
    };
  }
  return result;
}

export const FRAMEWORK_TAG_REGISTRY = buildCategoryView();

/**
 * Return all tag names for a given threat category.
 *
 * @param {string} category - e.g. "llm_threats"
 * @returns {string[]}
 */
export function getTagsForCategory(category) {
  return FRAMEWORK_TAG_REGISTRY[category]?.tags || [];
}

/**
 * Return all frameworks relevant to a given threat category.
 *
 * @param {string} category
 * @returns {string[]}
 */
export function getFrameworksForCategory(category) {
  return FRAMEWORK_TAG_REGISTRY[category]?.frameworks || [];
}
