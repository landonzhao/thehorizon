import { supabase } from "../storage/supabaseClient.js";
import { enrichSource } from "./enrichSource.js";
import { ALLOWED_TAGS } from "../classification/allowedTags.js";
import { deriveCategory } from "../classification/deriveCategory.js";

const CLASSIFICATION_VERSION = "classify-v5.0";
const LLM_INTER_CALL_MS = 2500;

export async function processSourceClaims({
  start,
  end,
  limit = 15,
  onlyPriority = true,
} = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("priority_score", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);
  if (onlyPriority) query = query.gte("priority_score", 35);

  const { data: sources, error } = await query;
  if (error) throw error;

  const results = [];

  for (const source of sources || []) {
    try {
      const extraction = await enrichSource(source);
      const cl = extraction.classification;

      const tags = (cl.tags || []).filter((t) => ALLOWED_TAGS.includes(t));
      const { main_category, category_confidence, category_reason } = deriveCategory(tags);

      const ai_specificity_score = cl.ai_specificity_score ?? source.ai_specificity_score ?? 0;
      const relevance_tier =
        source.trust_tier === "curated" || (source.tags || []).includes("curated")
          ? (source.relevance_tier || "core")
          : ai_specificity_score >= 40 ? "core"
          : ai_specificity_score >= 20 ? "adjacent"
          : "context";

      const update = {
        tags,
        main_category,
        category_confidence,
        category_reason,
        ai_specificity_score,
        ai_specificity_reason: cl.ai_specificity_reason,
        relevance_tier,
        tag_version: CLASSIFICATION_VERSION,
        claim_extraction_status: "success",
        claim_extraction_version: CLASSIFICATION_VERSION,
      };
      if (extraction.short_summary) update.short_summary = extraction.short_summary;
      if (extraction.analyst_brief)  update.analyst_brief  = extraction.analyst_brief;
      if (extraction.intelligence)   update.intelligence   = extraction.intelligence;
      if (extraction.claims?.length) update.claims         = extraction.claims;

      await supabase.from("sources").update(update).eq("id", source.id);

      results.push({
        source_id: source.id,
        title: source.title,
        status: "success",
        main_category,
        ai_specificity_score,
        claims: extraction.claims?.length ?? 0,
      });
    } catch (err) {
      results.push({
        source_id: source.id,
        title: source.title,
        status: "failed",
        error: err.message,
      });
    }

    await new Promise((r) => setTimeout(r, LLM_INTER_CALL_MS));
  }

  return {
    count: results.length,
    classification_version: CLASSIFICATION_VERSION,
    results,
  };
}
