import { supabase } from "../storage/supabaseClient.js";

// Must match DELETE_THRESHOLD in classifyStoredSources.js.
const AI_SPECIFICITY_THRESHOLD = 10;

// Batch size for DB operations to avoid query size limits
const BATCH_SIZE = 100;

// Broad AI keyword list used as a pre-filter gate for unclassified sources.
// Purpose: quickly discard sources with zero AI signal before LLM classification runs.
// A single match is enough to pass — the LLM will assign the precise score later.
const AI_KEYWORDS = [
  "artificial intelligence", "machine learning", "deep learning",
  "neural network", "large language model", " llm", "llm-",
  "generative ai", "foundation model", "diffusion model",
  "jailbreak", "prompt injection", "adversarial example", "adversarial ml",
  "deepfake", "voice cloning", "voice clone",
  "ai agent", "agentic ai", "autonomous agent",
  "model context protocol", "mcp server",
  "data poisoning", "model extraction", "model backdoor", "model inversion",
  "training data poisoning", "rag attack", "rag poisoning",
  "wormgpt", "darkgpt", "fraudgpt",
  "chatgpt", "gpt-4", "gpt-3", "claude ai", "claude model",
  "gemini model", "llama model", "mistral model", "openai",
  "ai-generated", "ai generated",
  "hugging face", "huggingface",
  "transformer model", "language model",
];

function hasAiKeyword(text) {
  // Prepend a space so keywords like " llm" match at the very start of the text
  const padded = " " + text;
  return AI_KEYWORDS.some((kw) => padded.includes(kw));
}

async function deleteSourceBatch(ids) {
  const { error } = await supabase
    .from("sources")
    .delete()
    .in("id", ids);
  if (error) throw error;
}

/**
 * Purge all sources in the database that are not relevant to the AI threat
 * landscape. This handles:
 *   1. Sources already classified with ai_specificity_score < threshold → delete.
 *   2. Sources not yet classified → keyword check; if zero AI signal, delete.
 *      Sources with any AI keyword are left for the LLM classifier to evaluate.
 *
 * Returns counts of deleted and retained sources.
 */
export async function purgeIrrelevantSources({ limit = 5000 } = {}) {
  let totalDeleted = 0;
  let totalRetained = 0;
  const deletedSample = [];

  // ── Pass 1: classified sources below threshold ───────────────────────────
  {
    const { data, error } = await supabase
      .from("sources")
      .select("id, title, ai_specificity_score")
      .not("ai_specificity_score", "is", null)
      .lt("ai_specificity_score", AI_SPECIFICITY_THRESHOLD)
      .neq("trust_tier", "curated")          // protect legacy curated sources
      .not("tags", "cs", '{"curated"}')      // protect sources with curated tag
      .limit(limit);

    if (error) throw error;

    const ids = (data || []).map((s) => s.id);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      await deleteSourceBatch(ids.slice(i, i + BATCH_SIZE));
    }

    totalDeleted += ids.length;
    deletedSample.push(
      ...(data || []).slice(0, 20).map((s) => ({
        id: s.id,
        title: s.title,
        ai_specificity_score: s.ai_specificity_score,
        reason: `Classified: score ${s.ai_specificity_score}/100 below threshold ${AI_SPECIFICITY_THRESHOLD}`,
      }))
    );
  }

  // ── Pass 2: unclassified sources with zero AI keyword signal ─────────────
  {
    const { data, error } = await supabase
      .from("sources")
      .select("id, title, summary, full_text, trust_tier")
      .is("ai_specificity_score", null)
      .neq("trust_tier", "curated")          // protect legacy curated sources
      .not("tags", "cs", '{"curated"}')      // protect sources with curated tag
      .limit(limit);

    if (error) throw error;

    const toDelete = [];

    for (const source of data || []) {
      const text = [source.title, source.summary, source.full_text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!hasAiKeyword(text)) {
        toDelete.push(source);
      } else {
        totalRetained += 1;
      }
    }

    const idsToDelete = toDelete.map((s) => s.id);
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      await deleteSourceBatch(idsToDelete.slice(i, i + BATCH_SIZE));
    }

    totalDeleted += toDelete.length;
    deletedSample.push(
      ...toDelete.slice(0, 20).map((s) => ({
        id: s.id,
        title: s.title,
        ai_specificity_score: 0,
        reason: "Unclassified: no AI keyword signal detected",
      }))
    );
  }

  return {
    deleted_count: totalDeleted,
    retained_unclassified_count: totalRetained,
    ai_specificity_threshold: AI_SPECIFICITY_THRESHOLD,
    deleted_sample: deletedSample.slice(0, 40),
  };
}
