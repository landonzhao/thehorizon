/**
 * Layer 8D — Category Analysis QA
 *
 * Two-pass QA over linked category analyses:
 *   Pass 1 (always): deterministic — removes insights with no cited evidence,
 *     no resolved evidence, or text too short. Downgrades confidence when
 *     retention rate < 50% → "low"; < 80% AND was "high" → "medium".
 *   Pass 2 (optional, skipLlmQa=false): LLM fact-check — verifies each
 *     remaining insight is actually supported by its cited evidence summaries.
 *
 * ── LLM CALL (optional Pass 2 only) ─────────────────────────────────────────
 * Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 * Models:  gpt-4o-mini  (OPENAI_API_KEY primary, OPENAI_API_KEY_2 secondary)
 *          gemini-2.0-flash / gemini-2.5-flash  (GEMINI_API_KEY / GEMINI_API_KEY_2)
 * Trigger: skipLlmQa=false (default: true — LLM QA is opt-in)
 * Output:  structured JSON (LLM_QA_SCHEMA): insight_verdicts[{insight_index, supported, reason}]
 * Label:   "Layer8D-qa-<category>"
 *
 * System prompt: LLM_QA_SYSTEM (constant, lines 119–122)
 *   Fact-checker role. Verifies each insight is supported by the evidence.
 *   Returns strict JSON only.
 *
 * User prompt: inline in runLlmQa() — lists each passing insight with its
 *   cited evidence summaries (up to 3 per insight). Asks for supported:true/false
 *   with reason per insight.
 *
 * Fallback: if LLM QA fails, returns null and skips Pass 2 silently.
 *
 * ── DETERMINISTIC PASS (always runs) ─────────────────────────────────────────
 * qaInsight(): rejects if no evidence_ids cited, no resolved_evidence, or
 *   insight text < 15 chars.
 * qaEarlySignal(): rejects if no evidence_ids, no resolved_evidence, signal < 10
 *   chars, or implication < 10 chars.
 * qaOutlook(): flags if no evidence_ids or resolved_evidence.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * Returns analysis with top_insights/early_signals/outlook annotated with
 * qa_issues[] and qa_pass bool. Adds qa_report with retention counts and
 * adjusted_confidence.
 */

import { callLLM } from "../../llm/callLLM.js";

// ── Deterministic QA ──────────────────────────────────────────────────────────

function qaInsight(insight) {
  const issues = [];

  // Must have at least one cited evidence ID
  if (!insight.supporting_evidence_ids?.length) {
    issues.push("no_evidence_cited");
  }

  // Must have at least one resolved evidence item
  if (!insight.resolved_evidence?.length) {
    issues.push("evidence_not_resolved");
  }

  // Insight text must not be empty or too short
  if (!insight.insight || insight.insight.length < 15) {
    issues.push("insight_too_short");
  }

  const isValid = issues.length === 0;
  return { ...insight, qa_issues: issues, qa_pass: isValid };
}

function qaEarlySignal(signal) {
  const issues = [];

  if (!signal.supporting_evidence_ids?.length) {
    issues.push("no_evidence_cited");
  }
  if (!signal.resolved_evidence?.length) {
    issues.push("evidence_not_resolved");
  }
  if (!signal.signal || signal.signal.length < 10) {
    issues.push("signal_too_short");
  }
  if (!signal.implication || signal.implication.length < 10) {
    issues.push("implication_too_short");
  }

  const isValid = issues.length === 0;
  return { ...signal, qa_issues: issues, qa_pass: isValid };
}

function qaOutlook(outlook) {
  if (!outlook) return null;
  const issues = [];

  if (!outlook.supporting_evidence_ids?.length) {
    issues.push("no_evidence_cited");
  }
  if (!outlook.resolved_evidence?.length) {
    issues.push("evidence_not_resolved");
  }
  if (!outlook.statement || outlook.statement.length < 20) {
    issues.push("statement_too_short");
  }

  return { ...outlook, qa_issues: issues, qa_pass: issues.length === 0 };
}

function computeQaConfidence(analysis, checkedInsights, checkedSignals, checkedOutlook) {
  const passedInsights = checkedInsights.filter((i) => i.qa_pass).length;
  const totalInsights  = checkedInsights.length;
  const outlookPasses  = checkedOutlook?.qa_pass ?? true;

  // Downgrade if many insights were removed
  const retentionRate = totalInsights > 0 ? passedInsights / totalInsights : 1;

  let confidence = analysis.analysis_confidence;

  if (retentionRate < 0.5) {
    confidence = "low";
  } else if (retentionRate < 0.8 && confidence === "high") {
    confidence = "medium";
  }

  if (!outlookPasses && confidence === "high") {
    confidence = "medium";
  }

  return confidence;
}

// ── Optional LLM QA ───────────────────────────────────────────────────────────

const LLM_QA_SCHEMA = {
  type: "object",
  required: ["insight_verdicts"],
  properties: {
    insight_verdicts: {
      type: "array",
      items: {
        type: "object",
        required: ["insight_index", "supported", "reason"],
        properties: {
          insight_index: { type: "number" },
          supported:     { type: "boolean" },
          reason:        { type: "string" },
        },
      },
    },
  },
};

const LLM_QA_SYSTEM = `You are a fact-checker for a strategic AI threat intelligence analysis.
Your task: verify that each insight is actually supported by the evidence provided.
Return strict JSON only. Do not invent facts.`;

async function runLlmQa(analysis) {
  const insightsText = (analysis.top_insights || [])
    .filter((i) => i.qa_pass)
    .map((ins, idx) => {
      const evSummaries = (ins.resolved_evidence || [])
        .slice(0, 3)
        .map((e) => e.short_summary || e.title || "")
        .filter(Boolean)
        .join(" | ");
      return `[${idx}] INSIGHT: "${ins.insight}"\n  EVIDENCE: ${evSummaries || "(none)"}`;
    })
    .join("\n\n");

  if (!insightsText) return null;

  const userPrompt = [
    `CATEGORY: ${analysis.category}`,
    "",
    "For each insight below, verify it is genuinely supported by the evidence summaries provided.",
    "",
    insightsText,
    "",
    "Return: { insight_verdicts: [{ insight_index, supported: true/false, reason: '...' }] }",
  ].join("\n");

  try {
    const raw = await callLLM(LLM_QA_SYSTEM, userPrompt, {
      schema:   LLM_QA_SCHEMA,
      logLabel: `Layer8D-qa-${analysis.category}`,
    });
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed?.insight_verdicts) ? parsed.insight_verdicts : null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * QA a single linked category analysis.
 *
 * @param {object}  analysis - Linked analysis from linkAnalysisEvidence().
 * @param {object}  [opts]
 * @param {boolean} [opts.skipLlmQa=true] - Skip optional LLM fact-checking pass.
 * @returns {Promise<object>} QA'd analysis with qa_report field.
 */
export async function qaCategoryAnalysis(analysis, opts = {}) {
  const { skipLlmQa = true } = opts;

  // ── Deterministic pass ──────────────────────────────────────────────────────
  const checkedInsights = (analysis.top_insights || []).map(qaInsight);
  const checkedSignals  = (analysis.early_signals || []).map(qaEarlySignal);
  const checkedOutlook  = qaOutlook(analysis.outlook);

  // ── Optional LLM pass ───────────────────────────────────────────────────────
  let llmVerdicts = null;
  if (!skipLlmQa) {
    llmVerdicts = await runLlmQa({ ...analysis, top_insights: checkedInsights });

    if (llmVerdicts) {
      for (const verdict of llmVerdicts) {
        const idx = verdict.insight_index;
        if (idx >= 0 && idx < checkedInsights.length && !verdict.supported) {
          checkedInsights[idx].qa_issues = [
            ...(checkedInsights[idx].qa_issues || []),
            `llm_unsupported: ${verdict.reason}`,
          ];
          checkedInsights[idx].qa_pass = false;
        }
      }
    }
  }

  // Keep only passing insights; retain all early signals (weak signals are expected to have thin evidence)
  const validInsights = checkedInsights.filter((i) => i.qa_pass);
  const removedCount  = checkedInsights.length - validInsights.length;

  const adjustedConfidence = computeQaConfidence(
    analysis, checkedInsights, checkedSignals, checkedOutlook
  );

  const qa_report = {
    original_insight_count:  checkedInsights.length,
    retained_insight_count:  validInsights.length,
    removed_insight_count:   removedCount,
    signal_issue_count:      checkedSignals.filter((s) => !s.qa_pass).length,
    outlook_pass:            checkedOutlook?.qa_pass ?? true,
    original_confidence:     analysis.analysis_confidence,
    adjusted_confidence:     adjustedConfidence,
    llm_qa_run:              llmVerdicts !== null,
    removed_insights:        checkedInsights.filter((i) => !i.qa_pass).map((i) => ({
      insight: i.insight,
      issues:  i.qa_issues,
    })),
  };

  return {
    ...analysis,
    top_insights:        validInsights,
    early_signals:       checkedSignals,
    outlook:             checkedOutlook,
    analysis_confidence: adjustedConfidence,
    qa_report,
  };
}

/**
 * QA all category analyses.
 *
 * @param {object[]} analyses - Linked analyses from linkAnalysisEvidence().
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlmQa=true]
 * @returns {Promise<object[]>}
 */
export async function qaAllCategoryAnalyses(analyses, opts = {}) {
  return Promise.all(analyses.map((a) => qaCategoryAnalysis(a, opts)));
}
