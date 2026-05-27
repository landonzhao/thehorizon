/**
 * Layer 3.3 — Source Data Typing
 *
 * Classifies what kind of source this is.
 * Uses deterministic rules first (classifySourceType.js).
 * Falls back to LLM disambiguation only when rule-based returns "unknown"
 * and the source has enough text to classify.
 *
 * Output field is source_type_reason (not source_type_method).
 */

import { classifySourceType }     from "../classifySourceType.js";
import { ALL_SOURCE_TYPES }       from "../../../config/sourceTypes.js";
import { loadPrompt, interpolate } from "../../../prompts/promptLoader.js";
import { callLLM }                from "../../../llm/callLLM.js";

async function disambiguateSourceType(source) {
  try {
    const { system, user } = loadPrompt("layer3-sourceTyping");
    const filledUser = interpolate(user, {
      title:                   source.title || "",
      publisher:               source.publisher || "Unknown",
      summary_or_text_excerpt: (source.summary || source.full_text || "").slice(0, 600),
      tags:                    (source.tags || []).join(", ") || "none",
    });

    const response = await callLLM(system, filledUser, { json: true });
    const parsed = typeof response === "string" ? JSON.parse(response) : response;

    if (ALL_SOURCE_TYPES.includes(parsed?.source_type)) {
      return {
        source_type:        parsed.source_type,
        confidence:         parsed.confidence || "medium",
        source_type_reason: "llm_disambiguation",
      };
    }
  } catch {
    // LLM failed — fall through to "unknown"
  }
  return null;
}

/**
 * Classify the source_type of a source.
 *
 * @param {object} source
 * @param {object} opts
 * @param {boolean} opts.skipLlm        — skip LLM entirely (fast mode)
 * @param {boolean} opts.forceLlmTyping — force LLM even for rule-matched sources
 * @returns {Promise<{
 *   source_type: string,
 *   source_type_confidence: "high"|"medium"|"low",
 *   source_type_reason: string,
 * }>}
 */
export async function classifyDataType(source, opts = {}) {
  const { skipLlm = false, forceLlmTyping = false } = opts;

  let { type: source_type, confidence: source_type_confidence, method: source_type_reason } =
    classifySourceType(source);

  const textLen = source.full_text?.length ?? 0;
  const shouldCallLlm = !skipLlm && (
    forceLlmTyping ||
    (source_type === "unknown" && textLen >= 100)
  );

  if (shouldCallLlm) {
    const llmResult = await disambiguateSourceType(source);
    if (llmResult) {
      source_type            = llmResult.source_type;
      source_type_confidence = llmResult.confidence;
      source_type_reason     = llmResult.source_type_reason;
    }
  }

  return { source_type, source_type_confidence, source_type_reason };
}
