/**
 * Layer 3 — Validity, Filtering & Data Typing
 *
 * Orchestrates five sublayers in sequence:
 *
 *   3.1  checkSourceValidity      Is the source structurally usable?
 *   3.2  assessAiRelevance        Is it meaningfully AI-cyber relevant?
 *   3.3  classifyDataType         What kind of source is it?
 *   3.4  assessTrustAndCredibility  How trustworthy is it?
 *   3.5  applyFinalGate           Should it proceed, be reviewed, or be discarded?
 *
 * Invalid sources are never silently dropped — they are returned with
 * layer3_status = "reject" and filter_flags describing why.
 */

import { checkSourceValidity }        from "./layer3/sourceValidity.js";
import { assessAiRelevance }          from "./layer3/aiRelevance.js";
import { classifyDataType }           from "./layer3/dataTyping.js";
import { assessTrustAndCredibility }  from "./layer3/trustAssessment.js";
import { applyFinalGate }             from "./layer3/finalGate.js";

/**
 * Run all Layer 3 sublayers on a single source.
 *
 * @param {object} source
 * @param {object} opts
 * @param {boolean} opts.skipLlm        — skip LLM in 3.3 (fast mode)
 * @param {boolean} opts.forceLlmTyping — force LLM in 3.3 regardless of rule result
 * @returns {Promise<object>} source enriched with all Layer 3 fields
 */
export async function validateAndTypeSource(source, opts = {}) {
  const { skipLlm = false } = opts;

  // 3.1 — Is it structurally usable?
  const validity = checkSourceValidity(source);

  // 3.2 — Is it AI-cyber relevant? (always run — fast heuristic)
  const relevance = assessAiRelevance(source);

  // 3.3 — What type is it?
  // Skip LLM if source already hard-failed validity — no point spending tokens.
  const typing = await classifyDataType(source, {
    ...opts,
    skipLlm: skipLlm || validity.hard_fail,
  });

  // 3.4 — How trustworthy is it?
  const trust = assessTrustAndCredibility(source);

  // 3.5 — Final gate: combine all sublayer results.
  const gate = applyFinalGate(validity, relevance, typing, trust);

  return {
    ...source,
    // 3.1 — Source validity
    is_valid:               validity.is_valid,
    validity_reason:        validity.validity_reason,
    filter_flags:           validity.filter_flags,
    text_quality_score:     validity.text_quality_score,
    publish_date_confidence: validity.publish_date_confidence,
    // 3.2 — AI relevance
    ai_relevance_score:     relevance.ai_relevance_score,
    cyber_relevance_score:  relevance.cyber_relevance_score,
    ai_specificity_score:   relevance.ai_specificity_score,
    relevance_tier:         relevance.relevance_tier,
    // 3.3 — Data typing
    source_type:            typing.source_type,
    source_type_confidence: typing.source_type_confidence,
    source_type_reason:     typing.source_type_reason,
    // 3.4 — Trust & credibility
    trust_tier:             trust.trust_tier,
    source_credibility_score: trust.source_credibility_score,
    credibility_reason:     trust.credibility_reason,
    trust_tier_reason:      trust.trust_tier_reason,
    // 3.5 — Final gate
    layer3_status:          gate.layer3_status,
    final_validity_reason:  gate.final_validity_reason,
    downstream_route:       gate.downstream_route,
  };
}

/**
 * Run Layer 3 on a batch of sources.
 *
 * All sources are returned — rejected sources have layer3_status = "reject".
 * Callers decide whether to filter by status.
 *
 * @param {object[]} sources
 * @param {object}   opts
 * @param {boolean}  opts.skipLlm
 * @param {boolean}  opts.forceLlmTyping
 * @param {number}   opts.llmDelayMs — delay between LLM calls in 3.3 (default 200ms)
 * @returns {Promise<{ sources, passing, rejected, stats }>}
 */
export async function validateAndTypeSources(sources, opts = {}) {
  const { llmDelayMs = 200 } = opts;
  let llmCalls = 0;
  const results = [];

  for (const source of sources) {
    const typed = await validateAndTypeSource(source, opts);
    results.push(typed);

    if (typed.source_type_reason === "llm_disambiguation") {
      llmCalls++;
      if (llmCalls > 1 && llmDelayMs > 0) {
        await new Promise((r) => setTimeout(r, llmDelayMs));
      }
    }
  }

  const passing  = results.filter((s) => s.layer3_status !== "reject");
  const rejected = results.filter((s) => s.layer3_status === "reject");
  const flagCounts = {};
  for (const s of rejected) {
    for (const flag of s.filter_flags || []) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }
  }

  return {
    sources:  results,   // all sources
    passing,             // pass + review
    rejected,            // discard
    stats: {
      total:         sources.length,
      pass_count:    results.filter((s) => s.layer3_status === "pass").length,
      review_count:  results.filter((s) => s.layer3_status === "review").length,
      reject_count:  rejected.length,
      llm_calls:     llmCalls,
      flag_frequency: flagCounts,
    },
  };
}
