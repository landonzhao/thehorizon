/**
 * Layer 6 — Strategic Viewpoint Synthesis
 *
 * Uses LLM to synthesize strategic analyst viewpoints from the top-scored
 * evidence sources and aggregated analytics. Each viewpoint is a single
 * defensible strategic claim backed by specific evidence.
 *
 * NOTE: This layer is beyond the current MVP scope (Layer 7.1 rawfact branch).
 * Retained for future use. Do not extend until Layer 7.1 output is stable.
 *
 * Falls back to deterministic mock viewpoints when LLM is unavailable.
 */

import { callLLM } from "../../llm/callLLM.js";

// ── Structured output schema ──────────────────────────────────────────────────

const VIEWPOINTS_SCHEMA = {
  type: "object",
  required: ["viewpoints"],
  properties: {
    viewpoints: {
      type: "array",
      items: {
        type: "object",
        required: [
          "viewpoint_id", "category", "viewpoint", "claim_type",
          "supporting_feed_evidence", "supporting_analytics",
          "confidence", "maturity", "watch_window", "speaker_note",
        ],
        properties: {
          viewpoint_id:             { type: "string" },
          category:                 { type: "string" },
          viewpoint:                { type: "string" },
          claim_type:               { type: "string" },
          supporting_feed_evidence: { type: "array", items: { type: "string" } },
          supporting_analytics:     { type: "array", items: { type: "string" } },
          confidence:               { type: "string" },
          maturity:                 { type: "string" },
          watch_window:             { type: "string" },
          speaker_note:             { type: "string" },
        },
      },
    },
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior cybersecurity intelligence analyst preparing a strategic AI threat horizon scan briefing for executives and technical decision-makers.

Your task: synthesize the evidence sources and analytics into strategic viewpoints for a presentation deck.

## WHAT MAKES A STRONG VIEWPOINT
A viewpoint is NOT a summary of a single incident. It is a strategic claim that:
- Can be supported by 2+ evidence sources
- Is forward-looking: what does this mean for defenders?
- Is actionable or watchable
- Uses precise threat vocabulary
- Would stand on its own as a slide headline

## VIEWPOINT FIELDS
viewpoint_id — sequential string: "vp_001", "vp_002", ...
category — one of: traditional_ai_threats | llm_threats | agentic_ai_threats | ai_enabled_threats | cross_category
viewpoint — 1–2 sentences. THE STRATEGIC CLAIM. Not a description of one source.
claim_type — one of:
  trend      — a direction observed across multiple sources over time
  insight    — a non-obvious conclusion drawn from the evidence
  early_signal — a weak but significant signal worth watching
  outlook    — a forward-looking assessment of likely near-term developments
  implication — what this evidence means for defenders or the threat landscape
supporting_feed_evidence — list of source IDs (from the evidence provided) that directly support this viewpoint
supporting_analytics — 1–2 sentences citing aggregate data (counts, distributions) that reinforces the claim
confidence — high (3+ corroborating sources) | medium (2 sources, or 1 strong authoritative source) | low (1 weak source or inference)
maturity — research | emerging | growing | operational | mainstream
watch_window — now | 3_6_months | 6_12_months
speaker_note — 2–3 sentences a presenter would say aloud. Add context, caveats, or call-to-action not in the viewpoint itself.

## REQUIREMENTS
- Generate 8–12 viewpoints
- Cover all four offensive threat categories (traditional_ai_threats, llm_threats, agentic_ai_threats, ai_enabled_threats)
- Include at least 1 cross_category viewpoint
- Include at least 2 early_signal viewpoints
- Do NOT invent facts — cite only what the evidence sources contain
- Prefer fewer high-confidence viewpoints over many weak ones
- Return strict JSON only — no markdown

## CLAIM TYPE GUIDANCE
Use early_signal when: only 1–2 sources cover a topic but the signal is novel or unexpected.
Use outlook when: the evidence points to a clear near-term trajectory defenders should prepare for.
Use insight when: the combined evidence reveals a non-obvious pattern or risk escalation.`;

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFENSIVE_CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
];

const TOP_N_PER_CATEGORY = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTopSourcesPerCategory(sources) {
  const byCategory = {};

  for (const source of sources) {
    const cat = source.main_category || source.understanding?.main_category || "unclear_or_adjacent";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(source);
  }

  const selected = [];
  for (const cat of [...OFFENSIVE_CATEGORIES, "unclear_or_adjacent"]) {
    const sorted = (byCategory[cat] || [])
      .filter((s) => s.feed_score_data)
      .sort((a, b) => (b.feed_score_data.feed_score ?? 0) - (a.feed_score_data.feed_score ?? 0))
      .slice(0, TOP_N_PER_CATEGORY);
    selected.push(...sorted);
  }

  const seen = new Set();
  return selected.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function buildUserPrompt(topSources, aggregates, categoryAnalyses = []) {
  const evidenceSummary = topSources.map((s) => {
    const summary = s.evidence_card?.short_summary
      || s.understanding?.source_summary
      || s.title;
    const claims = (s.understanding?.main_claims || s.evidence_card?.key_facts || [])
      .slice(0, 2).join("; ");
    const fwRefs = [
      ...(s.understanding?.framework_tags || []).map((t) => t.framework_ref),
      ...(s.understanding?.attack_mappings || []).map((t) => `${t.framework_ref}(${t.tactic || ""})`),
    ].join(", ");
    return [
      `[${s.id}] ${s.title}`,
      `  Source: ${s.publisher || "unknown"} | Date: ${(s.date_published || "").slice(0, 10)} | Score: ${s.feed_score_data?.feed_score ?? "?"}`,
      `  Category: ${s.main_category || "unknown"} | Type: ${s.source_type || "unknown"}`,
      fwRefs ? `  Frameworks: ${fwRefs}` : null,
      `  Summary: ${summary}`,
      claims ? `  Key claims: ${claims}` : null,
    ].filter(Boolean).join("\n");
  });

  const catStats = Object.entries(aggregates.category_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `  ${cat}: ${n}`)
    .join("\n");

  const maturityStats = Object.entries(aggregates.maturity_distribution || {})
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `  ${m}: ${n}`)
    .join("\n");

  const attackVectors = Object.entries(aggregates.attack_vector_frequency || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([v, n]) => `  ${v}: ${n}`)
    .join("\n");

  const parts = [
    `TOP EVIDENCE (${topSources.length} sources selected from ${aggregates.total_sources} total):`,
    "",
    evidenceSummary.join("\n\n"),
    "",
    "ANALYTICS SUMMARY:",
    `Category distribution:\n${catStats}`,
    `Maturity distribution:\n${maturityStats}`,
    attackVectors ? `Top attack vectors:\n${attackVectors}` : null,
    `Date range: ${aggregates.date_range?.earliest || "n/a"} → ${aggregates.date_range?.latest || "n/a"}`,
  ];

  // Category analyses from Layer 6.3 give the synthesis model pre-distilled
  // per-category insights, enabling higher-quality cross-category viewpoints.
  if (categoryAnalyses.length > 0) {
    parts.push("", "CATEGORY ANALYSES (pre-synthesized per-category briefs):");
    for (const ca of categoryAnalyses) {
      const label = (ca.category || "").replace(/_/g, " ").toUpperCase();
      const lines = [
        `[${label}] (confidence: ${ca.confidence || "unknown"})`,
        `Overview: ${ca.overview || ""}`,
        ca.top_insights?.length > 0
          ? `Top insights: ${ca.top_insights.join(" | ")}`
          : null,
        ca.early_signals?.length > 0
          ? `Early signals: ${ca.early_signals.join(" | ")}`
          : null,
        `Outlook: ${ca.outlook || ""}`,
      ];
      parts.push(lines.filter(Boolean).join("\n"));
    }
  }

  return parts.filter((l) => l !== null).join("\n");
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function mockViewpoints(feedSources) {
  const viewpoints = [];
  let idx = 1;

  for (const cat of OFFENSIVE_CATEGORIES) {
    const catSources = feedSources
      .filter((s) => (s.main_category || s.understanding?.main_category) === cat)
      .slice(0, 2);

    if (catSources.length === 0) continue;

    viewpoints.push({
      viewpoint_id: `vp_${String(idx++).padStart(3, "0")}`,
      category: cat,
      viewpoint: `Emerging activity observed in ${cat.replace(/_/g, " ")}. Key sources indicate evolving threat actor capabilities and new techniques requiring defender attention.`,
      claim_type: "trend",
      supporting_feed_evidence: catSources.map((s) => s.id),
      supporting_analytics:     [`${cat} represents notable activity in the reporting period`],
      confidence:    "medium",
      maturity:      "growing",
      watch_window:  "3_6_months",
      speaker_note:  `Evidence from ${catSources.map((s) => s.publisher).join(" and ")} highlights key developments. Defenders should monitor for escalation and review relevant controls.`,
    });
  }

  viewpoints.push({
    viewpoint_id: `vp_${String(idx).padStart(3, "0")}`,
    category: "cross_category",
    viewpoint: "Offensive AI tooling is lowering attacker skill barriers while simultaneously creating new high-value targets in AI infrastructure — a compounding risk that spans all four threat categories.",
    claim_type: "insight",
    supporting_feed_evidence: feedSources.slice(0, 3).map((s) => s.id),
    supporting_analytics:     ["Multiple categories show concurrent escalation across the reporting period"],
    confidence:   "medium",
    maturity:     "operational",
    watch_window: "now",
    speaker_note: "The convergence of AI-as-a-weapon and AI-as-a-target creates a feedback loop: compromising AI systems enables better offensive tools, which in turn target more AI systems. Integrated, cross-domain detection strategies are essential.",
  });

  return viewpoints;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Synthesize strategic viewpoints from evidence sources and analytics.
 *
 * @param {object[]} feedSources      - Sources enriched through the full feed branch.
 * @param {object}   aggregates       - Output of aggregateAnalytics().
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]        - Force deterministic mock viewpoints.
 * @param {object[]} [opts.categoryAnalyses=[]]  - Pre-synthesized per-category briefs from Layer 6.3.
 * @returns {Promise<object[]>} Array of viewpoint objects.
 */
export async function synthesizeViewpoints(feedSources, aggregates, opts = {}) {
  const { skipLlm = false, categoryAnalyses = [] } = opts;
  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  if (!hasLlm) return mockViewpoints(feedSources);

  const topSources  = getTopSourcesPerCategory(feedSources);
  const userPrompt  = buildUserPrompt(topSources, aggregates, categoryAnalyses);

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt, {
      schema:   VIEWPOINTS_SCHEMA,
      logLabel: "Layer6-synthesis",
    });
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (Array.isArray(parsed))           return parsed;
    if (Array.isArray(parsed?.viewpoints)) return parsed.viewpoints;

    process.stdout.write("  [Layer 6] Synthesis LLM returned unexpected shape — using mock\n");
    return mockViewpoints(feedSources);
  } catch (err) {
    process.stdout.write(`  [Layer 6] Synthesis LLM failed: ${err.message} — using mock\n`);
    return mockViewpoints(feedSources);
  }
}
