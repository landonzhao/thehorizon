import { supabase } from "../storage/supabaseClient.js";
import { classifySourceWithRules } from "./ruleBasedClassifier.js";
import { enrichSource } from "../claims/enrichSource.js";
import { TAG_DEFINITIONS } from "./tagDefinitions.js";
import { ALLOWED_TAGS } from "./allowedTags.js";

const CLASSIFICATION_VERSION = "classify-v2.0";
const DELETE_THRESHOLD = 10;
const TIER_CORE = 40;
const TIER_ADJACENT = 20;

// Gemini free tier: ~10 RPM. Only applied when Gemini is the active provider.
const GEMINI_RATE_LIMIT_MS = 7000;

function shouldUseLLM(source) {
  const hasKey = !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
  return hasKey && !source.claim_extraction_status;
}

// Only Gemini needs rate limiting. OpenAI paid tier has no meaningful limit at this volume.
function isGeminiOnly() {
  return !process.env.OPENAI_API_KEY && !!process.env.GEMINI_API_KEY;
}

function computeRuleAiSpecificity(text) {
  let score = 0;
  for (const def of TAG_DEFINITIONS) {
    if (!def.ai_weight || def.ai_weight === 0) continue;
    const hits = def.phrases.filter((p) => text.includes(p.toLowerCase()));
    if (hits.length > 0) score += def.ai_weight;
  }
  return Math.min(100, score);
}

function assignRelevanceTier(ai_specificity_score, source) {
  if (source.trust_tier === "curated") return source.relevance_tier || "core";
  if (ai_specificity_score >= TIER_CORE) return "core";
  if (ai_specificity_score >= TIER_ADJACENT) return "adjacent";
  return "context";
}

function buildUpdate({ tags, main_category, category_confidence, category_reason,
                       ai_specificity_score, ai_specificity_reason, relevance_tier,
                       short_summary, analyst_brief, intelligence, llm_used }) {
  const update = {
    tags,
    main_category,
    category_confidence,
    category_reason,
    ai_specificity_score,
    ai_specificity_reason,
    relevance_tier,
    tag_version: CLASSIFICATION_VERSION,
  };
  if (short_summary) update.short_summary = short_summary;
  if (analyst_brief) update.analyst_brief = analyst_brief;
  if (intelligence) update.intelligence = intelligence;
  if (llm_used) {
    update.claim_extraction_status = "success";
    update.claim_extraction_version = CLASSIFICATION_VERSION;
  }
  return update;
}

async function classifyOne(source) {
  let llm_used = false;
  let tags, main_category, category_confidence, category_reason;
  let ai_specificity_score, ai_specificity_reason;
  let short_summary = null, analyst_brief = null, intelligence = null;

  if (shouldUseLLM(source)) {
    try {
      const extraction = await enrichSource(source);
      const cl = extraction.classification;
      tags = cl.tags;
      main_category = cl.main_category;
      category_confidence = cl.category_confidence;
      category_reason = cl.category_reason;
      ai_specificity_score = cl.ai_specificity_score;
      ai_specificity_reason = cl.ai_specificity_reason;
      short_summary = extraction.short_summary;
      analyst_brief = extraction.analyst_brief;
      intelligence = extraction.intelligence;
      llm_used = true;
    } catch (err) {
      console.warn(`LLM enrichment failed for ${source.id}: ${err.message}`);
    }
  }

  if (!llm_used) {
    const classified = classifySourceWithRules(source);
    tags = classified.tags.filter((t) => ALLOWED_TAGS.includes(t));
    main_category = classified.rule_category;
    category_confidence = classified.rule_category_confidence || 20;
    category_reason = classified.rule_category_reason;
    const searchText = [source.title, source.summary, source.full_text]
      .filter(Boolean).join(" ").toLowerCase();
    ai_specificity_score = computeRuleAiSpecificity(searchText);
    ai_specificity_reason = ai_specificity_score > 0
      ? `Rule-based: AI-related phrases matched (score ${ai_specificity_score}/100).`
      : "Rule-based: no AI-related phrases matched.";
  }

  return { tags, main_category, category_confidence, category_reason,
           ai_specificity_score, ai_specificity_reason,
           short_summary, analyst_brief, intelligence, llm_used };
}

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
  const deleted = [];
  const errors = [];

  for (const source of sources || []) {
    try {
      const { tags, main_category, category_confidence, category_reason,
              ai_specificity_score, ai_specificity_reason,
              short_summary, analyst_brief, intelligence, llm_used } = await classifyOne(source);

      // Never delete curated sources regardless of score.
      if (source.trust_tier !== "curated" && ai_specificity_score < DELETE_THRESHOLD) {
        const { error: deleteError } = await supabase.from("sources").delete().eq("id", source.id);
        if (deleteError) throw deleteError;
        deleted.push({ id: source.id, title: source.title, ai_specificity_score,
                       reason: `Score ${ai_specificity_score}/100 — no AI or security signal.` });
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
        llm_used,
      });

      const { error: updateError } = await supabase.from("sources").update(update).eq("id", source.id);
      if (updateError) throw updateError;

      results.push({ id: source.id, title: source.title, llm_used,
                     main_category: resolved_category, ai_specificity_score, relevance_tier,
                     tags: update.tags });

      if (llm_used && isGeminiOnly()) {
        await new Promise((r) => setTimeout(r, GEMINI_RATE_LIMIT_MS));
      }

    } catch (err) {
      console.error(`Classification failed for source ${source.id}: ${err.message}`);
      errors.push({ id: source.id, title: source.title, error: err.message });
    }
  }

  return {
    count: results.length,
    deleted_count: deleted.length,
    error_count: errors.length,
    classification_version: CLASSIFICATION_VERSION,
    llm_count: results.filter((r) => r.llm_used).length,
    rule_count: results.filter((r) => !r.llm_used).length,
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
