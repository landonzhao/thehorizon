import { supabase } from "../storage/supabaseClient.js";
import { enrichSource } from "../claims/enrichSource.js";
import { ALLOWED_TAGS } from "./allowedTags.js";
import { deriveCategory } from "./deriveCategory.js";

const CLASSIFICATION_VERSION = "classify-v5.0";
const DELETE_THRESHOLD = 10;
const TIER_CORE = 40;
const TIER_ADJACENT = 20;

// Inter-LLM-call delay: Groq free tier is 30 RPM → need ≥2s between calls.
const LLM_INTER_CALL_MS = 2500;

function canUseLLM(source) {
  const hasKey = !!(
    process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_2 ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2
  );
  return hasKey && !source.claim_extraction_status;
}

function isCuratedSource(source) {
  return source.trust_tier === "curated" || (source.tags || []).includes("curated");
}

function assignRelevanceTier(ai_specificity_score, source) {
  if (isCuratedSource(source)) return source.relevance_tier || "core";
  if (ai_specificity_score >= TIER_CORE) return "core";
  if (ai_specificity_score >= TIER_ADJACENT) return "adjacent";
  return "context";
}

function buildUpdate({ tags, main_category, category_confidence, category_reason,
                       ai_specificity_score, ai_specificity_reason, relevance_tier,
                       short_summary, analyst_brief, intelligence, claims }) {
  const update = {
    tags,
    main_category,
    category_confidence,
    category_reason,
    ai_specificity_score,
    ai_specificity_reason,
    relevance_tier,
    tag_version: CLASSIFICATION_VERSION,
    claim_extraction_status: "success",
    claim_extraction_version: CLASSIFICATION_VERSION,
  };
  if (short_summary) update.short_summary = short_summary;
  if (analyst_brief) update.analyst_brief = analyst_brief;
  if (intelligence) update.intelligence = intelligence;
  if (claims?.length > 0) update.claims = claims;
  return update;
}

async function classifyOne(source) {
  if (!canUseLLM(source)) {
    return null; // No LLM keys or already classified — skip
  }

  const extraction = await enrichSource(source);
  const cl = extraction.classification;

  // LLM assigns tags and ai_specificity_score (taxonomy layer).
  // Category is derived deterministically from the tags (classification layer).
  const tags = (cl.tags || []).filter((t) => ALLOWED_TAGS.includes(t));
  const { main_category, category_confidence, category_reason } = deriveCategory(tags);

  return {
    tags,
    main_category,
    category_confidence,
    category_reason,
    ai_specificity_score: cl.ai_specificity_score,
    ai_specificity_reason: cl.ai_specificity_reason,
    short_summary: extraction.short_summary,
    analyst_brief: extraction.analyst_brief,
    intelligence: extraction.intelligence,
    claims: extraction.claims,
  };
}

export async function classifyStoredSources({ start, end, limit = 1000, onlyUnclassified = true, useLLM = true, testSet = false } = {}) {
  if (!useLLM) {
    return {
      count: 0, deleted_count: 0, error_count: 0,
      classification_version: CLASSIFICATION_VERSION,
      skipped_reason: "LLM classification required — useLLM=false is not supported in v5.0",
      sources: [], deleted: [], errors: [],
    };
  }

  let query = supabase
    .from("sources")
    .select("*")
    .order("date_published", { ascending: false })
    .limit(limit);

  if (onlyUnclassified) query = query.is("tag_version", null);
  if (testSet) query = query.eq("in_test_set", true);
  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);

  const { data: sources, error } = await query;
  if (error) throw error;

  const results = [];
  const deleted = [];
  const errors = [];
  const skipped = [];

  for (const source of sources || []) {
    try {
      const result = await classifyOne(source);

      if (!result) {
        skipped.push({ id: source.id, reason: "No LLM keys or already enriched" });
        continue;
      }

      const { tags, main_category, category_confidence, category_reason,
              ai_specificity_score, ai_specificity_reason,
              short_summary, analyst_brief, intelligence, claims } = result;

      // Never delete curated sources regardless of score.
      if (!isCuratedSource(source) && ai_specificity_score < DELETE_THRESHOLD) {
        const { error: deleteError } = await supabase.from("sources").delete().eq("id", source.id);
        if (deleteError) throw deleteError;
        deleted.push({ id: source.id, title: source.title, ai_specificity_score,
                       reason: `Score ${ai_specificity_score}/100 — no AI or security signal.` });
        // Still consumed an LLM call — respect the rate limit before moving on
        await new Promise((r) => setTimeout(r, LLM_INTER_CALL_MS));
        continue;
      }

      const relevance_tier = assignRelevanceTier(ai_specificity_score, source);
      const resolved_category = main_category || "uncategorised";

      const update = buildUpdate({
        tags: tags || source.tags || [],
        main_category: resolved_category,
        category_confidence,
        category_reason,
        ai_specificity_score: ai_specificity_score ?? source.ai_specificity_score,
        ai_specificity_reason,
        relevance_tier,
        short_summary,
        analyst_brief,
        intelligence,
        claims,
      });

      const { error: updateError } = await supabase.from("sources").update(update).eq("id", source.id);
      if (updateError) throw updateError;

      results.push({ id: source.id, title: source.title,
                     main_category: resolved_category, ai_specificity_score, relevance_tier,
                     tags: update.tags });

      await new Promise((r) => setTimeout(r, LLM_INTER_CALL_MS));

    } catch (err) {
      console.error(`Classification failed for source ${source.id}: ${err.message}`);
      errors.push({ id: source.id, title: source.title, error: err.message });
    }
  }

  return {
    count: results.length,
    deleted_count: deleted.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    classification_version: CLASSIFICATION_VERSION,
    tier_counts: {
      core: results.filter((r) => r.relevance_tier === "core").length,
      adjacent: results.filter((r) => r.relevance_tier === "adjacent").length,
      context: results.filter((r) => r.relevance_tier === "context").length,
    },
    sources: results,
    deleted,
    errors,
  };
}
