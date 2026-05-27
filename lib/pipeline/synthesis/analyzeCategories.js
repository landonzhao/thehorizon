/**
 * Layer 6.3 — Per-Category Analysis
 *
 * Runs one focused LLM call per active threat category to produce a structured
 * category brief. These briefs are passed as structured context to viewpoint
 * synthesis (Layer 6.4), enabling richer cross-category strategic claims without
 * flooding the synthesis call with hundreds of raw source snippets.
 *
 * NOTE: This layer is beyond the current MVP scope (Layer 7.1 rawfact branch).
 * Retained for future use. Do not extend until Layer 7.1 output is stable.
 *
 * Why this exists: a single synthesis call over 500+ sources produces shallow
 * viewpoints because the model loses category-specific nuance in a large context
 * window. Per-category pre-analysis produces distilled insights that the
 * synthesis step can then combine and contrast.
 *
 * See docs/prompts/layer6-category-analysis.md for full prompt documentation.
 */

import { callLLM } from "../../llm/callLLM.js";

const CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
];

// Top N sources per category included in the LLM prompt
const TOP_N = 8;

// Max parallel LLM calls
const CONCURRENCY = 3;

// ── Structured output schema ──────────────────────────────────────────────────

const CATEGORY_ANALYSIS_SCHEMA = {
  type: "object",
  required: [
    "category", "overview", "top_insights", "early_signals",
    "outlook", "recommended_visuals", "confidence", "key_source_ids",
  ],
  properties: {
    category:            { type: "string" },
    overview:            { type: "string" },
    top_insights:        { type: "array", items: { type: "string" } },
    early_signals:       { type: "array", items: { type: "string" } },
    outlook:             { type: "string" },
    recommended_visuals: { type: "array", items: { type: "string" } },
    confidence:          { type: "string", enum: ["high", "medium", "low"] },
    key_source_ids:      { type: "array", items: { type: "string" } },
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior AI cybersecurity intelligence analyst. Your task is to analyze all evidence from ONE specific threat category and produce a structured category brief that will be used as input for a strategic presentation deck.

## YOUR ROLE
You are the category specialist for this threat domain. You have reviewed all sources in this category and must synthesize them into a concise, strategic analysis.

## FIELDS

category — the threat category name (return exactly as provided)

overview — 2–3 sentences. What is the dominant story in this category this reporting period? Focus on what changed or escalated, not just what exists.

top_insights — 3–5 non-obvious conclusions drawn from the evidence as a whole.
  Each insight must be a SHORT declarative sentence (≤25 words).
  Must be cross-source conclusions, NOT summaries of individual sources.
  Good: "Threat actors are combining LLM jailbreaks with automated pipeline exploitation to bypass enterprise AI guardrails at scale."
  Bad: "A new paper describes a prompt injection technique."

early_signals — 0–3 weak signals: topics with only 1–2 sources but high novelty or strategic significance.
  Each entry format: "SIGNAL: [what] IMPLICATION: [why it matters in 3–6 months]"
  Empty array if no genuine early signals exist.

outlook — 1–2 sentences. Where is this category heading in the next 3–6 months based on the trajectory of current evidence? Be specific — name techniques, actors, or vectors.

recommended_visuals — 1–3 suggestions for charts or visuals that would best represent this category's data.
  e.g. "Timeline of incidents by month showing acceleration", "Radar chart of attack surface coverage"

confidence — high: 6+ quality sources | medium: 3–5 sources | low: 1–2 sources

key_source_ids — list of 3–5 source IDs (from the provided evidence) that were most influential in shaping this analysis.

## RULES
- Analyze only what the evidence supports — no speculation beyond the sources
- Do not repeat the same insight across top_insights, early_signals, and outlook
- Return strict JSON only — no markdown, no preamble`;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCategoryPrompt(category, sources, catAggregates) {
  const topSources = [...sources]
    .sort((a, b) => (b.feed_score_data?.feed_score ?? 0) - (a.feed_score_data?.feed_score ?? 0))
    .slice(0, TOP_N);

  const sourceLines = topSources.map((s) => {
    const summary =
      s.evidence_card?.short_summary ||
      s.understanding?.source_summary ||
      s.title;
    const facts = (s.evidence_card?.key_facts || s.understanding?.main_claims || [])
      .slice(0, 2).join("; ");
    const clusterNote = s.rawfact_cluster?.is_multi_source
      ? ` [CLUSTER:${s.rawfact_cluster.cluster_id} size=${s.rawfact_cluster.cluster_size}]`
      : "";
    return [
      `[${s.id}]${clusterNote} ${s.title} — ${s.publisher || "unknown"} (${(s.date_published || "").slice(0, 10)})`,
      `  Score: ${s.feed_score_data?.feed_score ?? "?"} | Type: ${s.source_type || "unknown"} | Priority: ${s.feed_score_data?.feed_priority || "unknown"}`,
      `  Summary: ${summary}`,
      facts ? `  Key facts: ${facts}` : null,
    ].filter(Boolean).join("\n");
  });

  const parts = [
    `CATEGORY: ${category.replace(/_/g, " ").toUpperCase()}`,
    `Total sources in category: ${sources.length} (showing top ${topSources.length} by score)`,
    "",
    "TOP SOURCES:",
    sourceLines.join("\n\n"),
  ];

  if (catAggregates) {
    parts.push("\nCATEGORY ANALYTICS:");

    if (Object.keys(catAggregates.source_types || {}).length > 0) {
      const types = Object.entries(catAggregates.source_types)
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([t, n]) => `  ${t}: ${n}`).join("\n");
      parts.push(`Source type breakdown:\n${types}`);
    }

    if (Object.keys(catAggregates.maturity || {}).length > 0) {
      const mat = Object.entries(catAggregates.maturity)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `  ${m}: ${n}`).join("\n");
      parts.push(`Maturity distribution:\n${mat}`);
    }

    if ((catAggregates.top_attack_vectors || []).length > 0) {
      parts.push(`Top attack vectors: ${catAggregates.top_attack_vectors.join(", ")}`);
    }
  }

  return parts.join("\n");
}

// ── Per-category aggregate extractor ─────────────────────────────────────────

function getCategoryAggregates(sources) {
  const source_types = {};
  const maturity = {};
  const vectors = {};

  for (const s of sources) {
    const st = s.source_type || "unknown";
    source_types[st] = (source_types[st] || 0) + 1;

    const mat = s.analytics_taxonomy?.analytics_maturity || "unknown";
    maturity[mat] = (maturity[mat] || 0) + 1;

    for (const v of (s.analytics_taxonomy?.analytics_attack_vectors || [])) {
      if (v) vectors[v] = (vectors[v] || 0) + 1;
    }
  }

  return {
    source_types,
    maturity,
    top_attack_vectors: Object.entries(vectors)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v]) => v),
  };
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function deterministicAnalysis(category, sources) {
  const topSources = [...sources]
    .sort((a, b) => (b.feed_score_data?.feed_score ?? 0) - (a.feed_score_data?.feed_score ?? 0))
    .slice(0, 5);

  const catLabel = category.replace(/_/g, " ");
  const mustRead = sources.filter((s) => s.feed_score_data?.feed_priority === "must_read").length;

  const insights = topSources.slice(0, 3).map((s) =>
    s.evidence_card?.key_facts?.[0] ||
    s.understanding?.main_claims?.[0] ||
    `Key ${s.source_type || "source"}: ${(s.title || "").slice(0, 80)}`
  );

  return {
    category,
    overview: `${sources.length} sources identified in ${catLabel} this reporting period, with ${mustRead} classified as must-read priority.`,
    top_insights: insights.filter(Boolean),
    early_signals: [],
    outlook: `Continued activity expected in ${catLabel}. Monitor high-priority sources for escalation over the next 3–6 months.`,
    recommended_visuals: ["Bar chart of source types", "Timeline by publication date"],
    confidence: mustRead >= 4 ? "medium" : "low",
    key_source_ids: topSources.slice(0, 3).map((s) => s.id),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Produce a structured brief for each active threat category.
 *
 * @param {object[]} sources    - Sources enriched through the analytics branch.
 * @param {object}   aggregates - Output of aggregateAnalytics().
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false] - Force deterministic fallback.
 * @returns {Promise<object[]>} One analysis object per non-empty category.
 */
export async function analyzeCategories(sources, aggregates, opts = {}) {
  const { skipLlm = false } = opts;
  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  // Group sources by category
  const byCat = {};
  for (const source of sources) {
    const cat = source.main_category || source.understanding?.main_category || "unclear_or_adjacent";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(source);
  }

  const active = CATEGORIES.filter((c) => (byCat[c] || []).length > 0);

  const results = [];

  for (let i = 0; i < active.length; i += CONCURRENCY) {
    const batch = active.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(batch.map(async (category) => {
      const catSources = byCat[category];

      if (!hasLlm) {
        return deterministicAnalysis(category, catSources);
      }

      const catAggregates = getCategoryAggregates(catSources);
      const userPrompt = buildCategoryPrompt(category, catSources, catAggregates);

      try {
        const raw = await callLLM(SYSTEM_PROMPT, userPrompt, {
          schema:   CATEGORY_ANALYSIS_SCHEMA,
          logLabel: `Layer6.3-${category}`,
        });
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        // Ensure category field is not overwritten with an LLM hallucination
        return { ...parsed, category };
      } catch (err) {
        process.stdout.write(
          `  [Layer 6.3] Category analysis failed for ${category}: ${err.message} — using fallback\n`
        );
        return deterministicAnalysis(category, catSources);
      }
    }));

    results.push(...batchResults.filter(Boolean));
  }

  return results;
}
