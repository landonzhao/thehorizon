import { supabase } from "../storage/supabaseClient.js";
import { classifySourceWithRules } from "./ruleBasedClassifier.js";

export async function classifyStoredSources({ start, end, limit = 1000 } = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("date_published", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);

  const { data: sources, error } = await query;
  if (error) throw error;

  const results = [];

  for (const source of sources || []) {
    const classified = classifySourceWithRules(source);

    const final = {
      ...source,
      tags: classified.tags,
      main_category: classified.rule_category || "llm_threats",
      category_confidence: classified.rule_category_confidence || 20,
      category_reason: classified.rule_category_reason,
      tag_version: "rule-based-v1",
    };

    const { error: updateError } = await supabase
      .from("sources")
      .update({
        tags: final.tags,
        main_category: final.main_category,
        category_confidence: final.category_confidence,
        category_reason: final.category_reason,
        tag_version: final.tag_version,
      })
      .eq("id", source.id);

    if (updateError) throw updateError;

    results.push(final);
  }

  return {
    count: results.length,
    llm_enabled: false,
    classification_mode: "rule_based_keyphrase",
    sources: results,
  };
}
