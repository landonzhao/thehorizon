/**
 * Layer 8B — Category Analysis LLM Call
 *
 * Runs one focused LLM call per active threat category using the evidence
 * dossier assembled by Layer 8A. Every insight, early signal, and outlook
 * statement MUST cite at least one evidence_id from the dossier.
 * The LLM is constrained to only claim what the provided evidence supports.
 *
 * ── LLM CALL ─────────────────────────────────────────────────────────────────
 * Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 * Models:  gpt-4o-mini  (OPENAI_API_KEY primary, OPENAI_API_KEY_2 secondary)
 *          gemini-2.0-flash / gemini-2.5-flash  (GEMINI_API_KEY / GEMINI_API_KEY_2)
 *          NOTE: GROQ_API_KEY is NOT used here (open-source models insufficient
 *          for structured multi-claim analysis with citation tracing).
 * Trigger: OPENAI_API_KEY or GEMINI_API_KEY present AND skipLlm=false
 *          AND dossier.source_count >= 2
 * Output:  structured JSON via json_schema response_format (CATEGORY_ANALYSIS_SCHEMA)
 * Label:   "Layer8B-<category>"  (one call per active category)
 *
 * System prompt: SYSTEM_PROMPT (constant, lines 74–121)
 *   Senior AI cybersecurity intelligence analyst role. Strict evidence-grounding:
 *   every insight/signal/outlook MUST cite supporting_evidence_ids from the dossier.
 *   Defines 6 output fields: category (unchanged), overview (no citations),
 *   top_insights (3–5, each ≤25 words, min 1 evidence_id),
 *   early_signals (0–3 weak signals with implications),
 *   outlook (1–2 sentences, 3-6 month horizon, evidence-cited),
 *   analysis_confidence (high/medium/low based on dossier quality),
 *   key_source_ids (3–5 most influential source IDs).
 *
 * User prompt: buildCategoryPrompt(dossier) — category label, source count,
 *   formatted rawfact evidence block (evidence_id, title, publisher, date,
 *   source_type, score, priority, card title, summary, key_facts, stats,
 *   attack_flow, why_it_matters, attack_vectors, signal_clusters, cluster info),
 *   formatted analytics block (analytics_id, metric_name, top 8 entries).
 *
 * Fallback (no keys, skipLlm=true, or source_count < 2):
 *   deterministicAnalysis() — creates one insight per top rawfact item using
 *   key_facts[0] or short_summary. confidence based on must_read count.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * { category, overview, top_insights[], early_signals[], outlook,
 *   analysis_confidence, key_source_ids, analysis_version, llm_used }
 *
 * Evidence IDs use "raw_<source_id>" format.
 * Layer 8C (linkAnalysisEvidence) resolves these to full citation objects.
 */

import { callLLM } from "../../llm/callLLM.js";

export const ANALYSIS_VERSION = "analysis-v1.0";

// ── Output schema ─────────────────────────────────────────────────────────────

const CATEGORY_ANALYSIS_SCHEMA = {
  type: "object",
  required: [
    "category", "overview", "top_insights", "early_signals",
    "outlook", "analysis_confidence", "key_source_ids",
  ],
  properties: {
    category:   { type: "string" },
    overview:   { type: "string" },
    top_insights: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        required: ["insight", "supporting_evidence_ids", "confidence"],
        properties: {
          insight:                 { type: "string" },
          supporting_evidence_ids: { type: "array", items: { type: "string" } },
          confidence:              { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    early_signals: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        required: ["signal", "implication", "supporting_evidence_ids"],
        properties: {
          signal:                  { type: "string" },
          implication:             { type: "string" },
          supporting_evidence_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    outlook: {
      type: "object",
      required: ["statement", "supporting_evidence_ids", "time_horizon"],
      properties: {
        statement:               { type: "string" },
        supporting_evidence_ids: { type: "array", items: { type: "string" } },
        time_horizon:            { type: "string" },
      },
    },
    analysis_confidence: { type: "string", enum: ["high", "medium", "low"] },
    key_source_ids:      { type: "array", items: { type: "string" } },
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior AI cybersecurity intelligence analyst preparing a category brief for a strategic AI threat horizon scan deck.

## YOUR TASK
Analyze the evidence dossier for ONE threat category and produce a structured category analysis.
You may ONLY draw conclusions that are directly supported by the provided evidence items.
Every insight, early signal, and outlook statement MUST cite the evidence_id(s) that support it.

## EVIDENCE ID FORMAT
Evidence IDs look like "raw_<alphanumeric>" (rawfact sources) or "agg_<category>_<metric>" (analytics aggregates).
Use EXACTLY the evidence_id strings as they appear in the dossier — do not invent or modify them.

## FIELDS

category — return exactly as provided, unchanged.

overview — 2–3 sentences. What is the dominant pattern in this category this reporting period?
  Focus on what changed or is escalating, not just what exists.
  Do NOT cite evidence_ids in overview — it is a synthesis statement.

top_insights — 3–5 insights (fewer if evidence does not support more).
  Each insight is a SHORT declarative sentence (≤25 words) drawing a cross-source conclusion.
  MUST include at least 1 supporting_evidence_id from the dossier.
  Good: "Threat actors are combining LLM jailbreaks with automated pipeline exploitation to bypass enterprise AI guardrails at scale."
  Bad: "A new paper describes a prompt injection technique." (single-source summary, not an insight)
  Never repeat the same claim across insights.

early_signals — 0–3 weak signals: topics with only 1–2 sources but high novelty or strategic significance.
  Each entry: signal (what is observed), implication (why it matters in 3–6 months).
  MUST cite at least 1 supporting_evidence_id.
  Return empty array [] if no genuine early signals exist in the dossier.

outlook — where this category is heading in the next 3–6 months.
  statement: 1–2 sentences. Name specific techniques, actors, or vectors where the evidence supports it.
  supporting_evidence_ids: cite the evidence items most relevant to this projection.
  time_horizon: always "3-6 months".

analysis_confidence — based solely on the dossier quality:
  "high": 6+ quality sources with evidence cards
  "medium": 3–5 quality sources
  "low": 1–2 sources or no evidence cards

key_source_ids — 3–5 source_ids (NOT evidence_ids) from the rawfact evidence that most shaped this analysis.

## RULES
- Cite ONLY evidence_ids that appear in the dossier provided.
- Analyze only what the evidence supports — no speculation beyond the sources.
- Do not repeat the same claim in overview, top_insights, early_signals, and outlook.
- Return strict JSON only — no markdown, no preamble.`;

// ── Prompt builder ────────────────────────────────────────────────────────────

function formatAnalyticsEvidence(analyticsItems) {
  if (!analyticsItems.length) return "";

  const lines = ["ANALYTICS EVIDENCE (cite analytics_id to reference):"];
  for (const item of analyticsItems) {
    const topEntries = Object.entries(item.value)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    lines.push(`[${item.analytics_id}] ${item.metric_name}: { ${topEntries} }`);
  }
  return lines.join("\n");
}

function formatRawfactEvidence(rawfactItems) {
  if (!rawfactItems.length) return "No rawfact evidence available.";

  return rawfactItems.map((item) => {
    const parts = [
      `[${item.evidence_id}] ${item.title}`,
      `  publisher=${item.publisher || "unknown"}  date=${item.published_date || "?"}  type=${item.source_type}  score=${item.rawfact_score}  priority=${item.rawfact_priority}`,
    ];

    if (item.evidence_card_title) {
      parts.push(`  card: ${item.evidence_card_title}`);
    }
    if (item.short_summary) {
      parts.push(`  summary: ${item.short_summary.slice(0, 200)}`);
    }
    if (item.key_facts.length > 0) {
      parts.push(`  key facts: ${item.key_facts.slice(0, 3).join(" | ")}`);
    }
    if (item.numbers_statistics.length > 0) {
      parts.push(`  stats: ${item.numbers_statistics.slice(0, 3).join(" | ")}`);
    }
    if (item.attack_flow.length > 0) {
      parts.push(`  attack flow: ${item.attack_flow.slice(0, 3).join(" → ")}`);
    }
    if (item.why_it_matters) {
      parts.push(`  why it matters: ${item.why_it_matters.slice(0, 150)}`);
    }
    if (item.analytics_attack_vectors.length > 0) {
      parts.push(`  attack vectors: ${item.analytics_attack_vectors.join(", ")}`);
    }
    if (item.analytics_signal_clusters.length > 0) {
      parts.push(`  signal clusters: ${item.analytics_signal_clusters.join(", ")}`);
    }
    if (item.cluster_id && item.cluster_size > 1) {
      parts.push(`  cluster: ${item.cluster_id} (${item.cluster_size} sources, representative=${item.is_cluster_representative})`);
    }
    return parts.join("\n");
  }).join("\n\n");
}

function buildCategoryPrompt(dossier) {
  const catLabel = dossier.category.replace(/_/g, " ").toUpperCase();

  return [
    `CATEGORY: ${catLabel}`,
    `Total sources in this category: ${dossier.source_count}`,
    `Rawfact evidence items (top ${dossier.rawfact_evidence.length} by priority and score):`,
    "",
    formatRawfactEvidence(dossier.rawfact_evidence),
    "",
    formatAnalyticsEvidence(dossier.analytics_evidence),
    "",
    `Produce the category analysis for "${dossier.category}" using ONLY the evidence above.`,
    `Every insight and early_signal must cite at least one evidence_id from this dossier.`,
  ].join("\n");
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function deterministicAnalysis(dossier) {
  const { category, source_count, rawfact_evidence: items } = dossier;

  const topItems = items.slice(0, 3);
  const mustReadCount = items.filter((i) => i.rawfact_priority === "must_read").length;

  const insights = topItems.map((item) => ({
    insight: item.key_facts[0] ||
             item.short_summary?.slice(0, 120) ||
             `${item.source_type}: ${item.title.slice(0, 80)}`,
    supporting_evidence_ids: [item.evidence_id],
    confidence: item.rawfact_priority === "must_read" ? "high" :
                item.rawfact_priority === "high"      ? "medium" : "low",
  })).filter((i) => i.insight);

  const confidence = mustReadCount >= 4 ? "medium" : source_count >= 10 ? "medium" : "low";

  return {
    category,
    overview: `${source_count} sources identified in ${category.replace(/_/g, " ")} this reporting period, with ${mustReadCount} classified as must-read priority.`,
    top_insights: insights,
    early_signals: [],
    outlook: {
      statement: `Continued activity expected in ${category.replace(/_/g, " ")}. Monitor high-priority sources for escalation.`,
      supporting_evidence_ids: topItems.slice(0, 2).map((i) => i.evidence_id),
      time_horizon: "3-6 months",
    },
    analysis_confidence: confidence,
    key_source_ids: topItems.map((i) => i.source_id),
    analysis_version: ANALYSIS_VERSION,
    llm_used: false,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run category analysis for a single category dossier.
 *
 * @param {object}  dossier   - Output of buildCategoryDossier().
 * @param {object}  [opts]
 * @param {boolean} [opts.skipLlm=false] - Force deterministic fallback.
 * @returns {Promise<object>} Structured category analysis.
 */
export async function analyzeCategory(dossier, opts = {}) {
  const { skipLlm = false } = opts;

  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  // Skip LLM for very thin categories
  if (dossier.source_count < 2 || !hasLlm) {
    return deterministicAnalysis(dossier);
  }

  const userPrompt = buildCategoryPrompt(dossier);

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt, {
      schema:   CATEGORY_ANALYSIS_SCHEMA,
      logLabel: `Layer8B-${dossier.category}`,
    });
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      ...parsed,
      category:         dossier.category,
      analysis_version: ANALYSIS_VERSION,
      llm_used:         true,
    };
  } catch (err) {
    process.stdout.write(
      `  [Layer 8B] Analysis failed for ${dossier.category}: ${err.message} — using fallback\n`
    );
    return deterministicAnalysis(dossier);
  }
}
