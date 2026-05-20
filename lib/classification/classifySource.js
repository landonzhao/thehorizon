import { classifySourceWithRules } from "./ruleBasedClassifier.js";
import { TAG_VERSION } from "./taxonomy.js";

export function classifySource(source) {
  const classified = classifySourceWithRules(source);

  return {
    ...classified,
    main_category: classified.rule_category || "llm_threats",
    category_confidence: classified.rule_category_confidence || 20,
    category_reason: classified.rule_category_reason,
    tag_version: TAG_VERSION,
  };
}
