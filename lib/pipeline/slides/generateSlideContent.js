/**
 * Layer 7 — Slide Content Generator
 *
 * Generates structured slide content from the deck plan (planSlides output)
 * using category analyses (Layer 8) as the sole evidence source.
 *
 * Every evidence callout MUST carry an evidence_id that traces back to a
 * rawfact dossier item. No facts may be invented by the LLM.
 *
 * Structural slides (title, section_divider, appendix) are built
 * deterministically — no LLM call regardless of skipLlm setting.
 *
 * ── LLM CALL ─────────────────────────────────────────────────────────────────
 * Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 * Models:  gpt-4o-mini  (OPENAI_API_KEY primary, OPENAI_API_KEY_2 secondary)
 *          gemini-2.0-flash / gemini-2.5-flash  (GEMINI_API_KEY / GEMINI_API_KEY_2)
 *          NOTE: GROQ_API_KEY is NOT used (citation tracing requires strict schema)
 * Trigger: any OpenAI or Gemini key present AND skipLlm=false
 *          AND slide_type NOT IN (title, section_divider, appendix)
 * Output:  structured JSON via json_schema response_format (SLIDE_SCHEMA)
 * Label:   "Layer7-slide<N>-<type>"
 * Concurrency: 3 parallel calls (default)
 *
 * System prompt: SYSTEM_PROMPT (constant, lines 53–81)
 *   Professional AI cybersecurity briefing deck role. Defines field requirements:
 *   title (return exactly as provided), headline (≤20 words, must be an insight),
 *   bullets (3–5, max 15 words each, evidence-backed, no filler),
 *   evidence_callouts (1–3, EACH must include evidence_id copied EXACTLY from the
 *   rawfact dossier — DO NOT invent facts or evidence_ids),
 *   citations (one string per source: "Publisher — Title (URL)").
 *   Absolute rule: every evidence callout must reference an evidence_id from the dossier.
 *
 * User prompts (per slide type):
 *   category_content: buildCategoryPrompt(slidePlan) — slide title, category,
 *     core message, available viz IDs, full category analysis (insights, early
 *     signals, outlook), rawfact evidence items with all dossier fields,
 *     analytics evidence block.
 *   all other content slides: buildCrossOrOutlookPrompt(slidePlan) — slide title,
 *     core message, available viz IDs, type-specific context (cross_category:
 *     insights + signal/theme counts; outlook: per-category statements + early
 *     signals; conclusion: high-confidence insights; exec_overview: top insight
 *     per category + aggregate counts).
 *
 * Fallback (no keys or skipLlm=true):
 *   deterministicCategoryContent() — builds bullets from analysis top_insights,
 *     evidence_callouts from first 3 rawfact items (evidence_id preserved).
 *   deterministicOverviewContent() — bullets from cross_category_insights or
 *     outlook_statements; no evidence callouts.
 *
 * ── OUTPUT PER SLIDE ─────────────────────────────────────────────────────────
 * { slide_number, slide_type, title, headline, bullets[],
 *   evidence_callouts[{evidence_id, title, key_fact, publisher, url}],
 *   visualization_ids[], citations[], speaker_note_intent,
 *   category, core_message, _plan }
 */

import { callLLM } from "../../llm/callLLM.js";
import { CATEGORY_LABELS } from "./planSlides.js";

// ── Output schema ─────────────────────────────────────────────────────────────

const SLIDE_SCHEMA = {
  type: "object",
  required: ["title", "headline", "bullets", "evidence_callouts", "citations"],
  properties: {
    title:    { type: "string" },
    headline: { type: "string" },
    bullets:  { type: "array", maxItems: 5, items: { type: "string" } },
    evidence_callouts: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        required: ["title", "key_fact", "publisher", "evidence_id"],
        properties: {
          title:       { type: "string" },
          key_fact:    { type: "string" },
          publisher:   { type: "string" },
          evidence_id: { type: "string" },
          url:         { type: "string" },
        },
      },
    },
    citations: { type: "array", items: { type: "string" } },
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are generating content for a professional AI cybersecurity threat horizon scan briefing deck.

Style: concise, strategic, evidence-backed. Suitable for government and conference presentations.
Audience: cybersecurity executives, policy analysts, technical leads.

## FIELD REQUIREMENTS

title — return the provided slide title exactly.

headline — ONE strategic claim (≤20 words). Not a description — an insight.
  Good: "Prompt injection has moved from research to operational exploitation in 12 months."
  Bad: "This slide covers prompt injection."

bullets — 3–5 points (max 15 words each). Each must be a distinct, evidence-backed claim.
  No bullet repeats the headline. No filler.

evidence_callouts — 1–3 callouts. Each MUST trace to an evidence item from the dossier.
  evidence_id: copy EXACTLY from the rawfact_evidence items provided.
  key_fact: a SPECIFIC fact from that source (a number, name, or concrete claim from the evidence).
  title, publisher, url: copy from the evidence item.
  DO NOT invent facts. Only use what is in the evidence.

citations — one string per cited source: "Publisher — Title (URL)"

## ABSOLUTE RULES
- Do not speculate or invent facts not in the provided analysis/evidence
- Every evidence callout must reference an evidence_id from the dossier
- Bullets max 5, max 15 words each
- Return strict JSON only — no markdown, no preamble`;

// ── Prompt builders ────────────────────────────────────────────────────────────

function formatRawfactEvidence(items) {
  if (!items?.length) return "(no rawfact evidence)";
  return items.map((item) => [
    `[${item.evidence_id}] ${item.title}`,
    `  publisher=${item.publisher || "?"}  date=${item.published_date || "?"}  type=${item.source_type}  score=${item.rawfact_score}  priority=${item.rawfact_priority}`,
    item.short_summary     ? `  summary: ${item.short_summary.slice(0, 200)}` : null,
    item.key_facts?.length ? `  key facts: ${item.key_facts.slice(0, 3).join(" | ")}` : null,
    item.numbers_statistics?.length ? `  stats: ${item.numbers_statistics.slice(0, 2).join(" | ")}` : null,
    item.attack_flow?.length ? `  attack flow: ${item.attack_flow.slice(0, 3).join(" → ")}` : null,
    item.why_it_matters    ? `  why it matters: ${item.why_it_matters.slice(0, 150)}` : null,
    item.url               ? `  url: ${item.url}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");
}

function formatAnalytics(items) {
  if (!items?.length) return "";
  return "ANALYTICS:\n" + items.map((item) => {
    const top = Object.entries(item.value || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => `${k}:${v}`).join(", ");
    return `[${item.analytics_id}] ${item.metric_name}: { ${top} }`;
  }).join("\n");
}

function formatCategoryInsights(analysis) {
  if (!analysis) return "";
  const insights = (analysis.top_insights || []).map((ins, i) =>
    `[${i+1}] [${ins.confidence}] ${ins.insight}`
  ).join("\n");

  const earlySignals = (analysis.early_signals || [])
    .filter((s) => s.qa_pass !== false)
    .map((s) => `EARLY SIGNAL: ${s.signal} → IMPLICATION: ${s.implication}`)
    .join("\n");

  return [
    analysis.overview ? `OVERVIEW: ${analysis.overview}` : "",
    insights ? `TOP INSIGHTS:\n${insights}` : "",
    earlySignals ? `EARLY SIGNALS:\n${earlySignals}` : "",
    analysis.outlook?.statement ? `OUTLOOK: ${analysis.outlook.statement}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildCategoryPrompt(slidePlan) {
  const { title, category, rawfact_evidence, analytics_evidence, category_analysis, core_message, visualization_ids } = slidePlan;

  return [
    `SLIDE TITLE: ${title}`,
    `CATEGORY: ${CATEGORY_LABELS[category] || category || "N/A"}`,
    `CORE MESSAGE: ${core_message}`,
    visualization_ids?.length ? `AVAILABLE VISUALIZATIONS: ${visualization_ids.join(", ")}` : "",
    "",
    "CATEGORY ANALYSIS:",
    formatCategoryInsights(category_analysis),
    "",
    "RAWFACT EVIDENCE (use evidence_id in callouts):",
    formatRawfactEvidence(rawfact_evidence),
    "",
    formatAnalytics(analytics_evidence),
    "",
    "Generate slide content. Every evidence callout MUST use an evidence_id from the dossier above.",
  ].filter((l) => l !== undefined).join("\n");
}

function buildCrossOrOutlookPrompt(slidePlan) {
  const { title, slide_type, cross_category_insights, outlook_statements, early_signals, aggregates_summary, core_message, visualization_ids } = slidePlan;

  const contextLines = [];

  if (slide_type === "cross_category") {
    contextLines.push(`CROSS-CATEGORY INSIGHTS:`);
    for (const s of (cross_category_insights || [])) {
      contextLines.push(`  [${s.category}] ${s.signal || s.insight} ${s.implication ? `→ ${s.implication}` : ""}`);
    }
    if (aggregates_summary?.signal_cluster_counts) {
      const top = Object.entries(aggregates_summary.signal_cluster_counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(", ");
      contextLines.push(`\nTOP SIGNAL CLUSTERS: ${top}`);
    }
    if (aggregates_summary?.recurring_theme_counts) {
      const top = Object.entries(aggregates_summary.recurring_theme_counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(", ");
      contextLines.push(`TOP RECURRING THEMES: ${top}`);
    }
  }

  if (slide_type === "outlook") {
    contextLines.push("CATEGORY OUTLOOKS:");
    for (const o of (outlook_statements || [])) {
      contextLines.push(`  [${CATEGORY_LABELS[o.category] || o.category}] ${o.statement}`);
    }
    if ((early_signals || []).length > 0) {
      contextLines.push("\nEARLY SIGNALS:");
      for (const s of early_signals) {
        contextLines.push(`  [${CATEGORY_LABELS[s.category] || s.category}] ${s.signal} → ${s.implication}`);
      }
    }
  }

  if (slide_type === "conclusion") {
    contextLines.push("HIGH-CONFIDENCE INSIGHTS ACROSS CATEGORIES:");
    for (const ins of (cross_category_insights || [])) {
      contextLines.push(`  [${CATEGORY_LABELS[ins.category] || ins.category}] ${ins.insight}`);
    }
  }

  if (slide_type === "exec_overview") {
    contextLines.push("TOP INSIGHT PER CATEGORY:");
    for (const ins of (cross_category_insights || [])) {
      contextLines.push(`  [${CATEGORY_LABELS[ins.category] || ins.category}] ${ins.insight}`);
    }
    if (aggregates_summary) {
      contextLines.push(`\nTOTAL SOURCES: ${aggregates_summary.total_sources}`);
      contextLines.push(`CATEGORY COUNTS: ${JSON.stringify(aggregates_summary.category_counts)}`);
      if (aggregates_summary.top_attack_vectors?.length) {
        contextLines.push(`TOP ATTACK VECTORS: ${aggregates_summary.top_attack_vectors.join(", ")}`);
      }
    }
  }

  return [
    `SLIDE TITLE: ${title}`,
    `CORE MESSAGE: ${core_message}`,
    visualization_ids?.length ? `AVAILABLE VISUALIZATIONS: ${visualization_ids.join(", ")}` : "",
    "",
    contextLines.join("\n"),
    "",
    "Generate slide content. Note: for cross-category/outlook/overview slides, evidence_callouts may be empty array [] if no specific rawfact items are available.",
  ].filter((l) => l !== undefined).join("\n");
}

// ── Deterministic fallbacks ────────────────────────────────────────────────────

function deterministicCategoryContent(slidePlan) {
  const { title, category_analysis, rawfact_evidence, analytics_evidence, visualization_ids, core_message } = slidePlan;
  const analysis = category_analysis;

  const bullets = [
    ...(analysis?.top_insights || []).slice(0, 3).map((ins) => ins.insight?.slice(0, 80)),
    ...(analysis?.early_signals || []).slice(0, 1).map((s) => `Early signal: ${s.signal?.slice(0, 60)}`),
  ].filter(Boolean).slice(0, 5);

  const evidence_callouts = (rawfact_evidence || []).slice(0, 3).map((item) => ({
    title:       item.title,
    key_fact:    (item.key_facts?.[0] || item.short_summary || "").slice(0, 150),
    publisher:   item.publisher || "",
    evidence_id: item.evidence_id,
    url:         item.url || "",
  }));

  const citations = evidence_callouts.map((c) =>
    `${c.publisher} — ${c.title}${c.url ? ` (${c.url})` : ""}`
  );

  return {
    headline: (analysis?.top_insights || [])[0]?.insight?.slice(0, 100) || core_message,
    bullets: bullets.length ? bullets : [core_message],
    evidence_callouts,
    visualization_ids: visualization_ids || [],
    citations,
  };
}

function deterministicOverviewContent(slidePlan) {
  const { title, cross_category_insights, aggregates_summary, outlook_statements, core_message, visualization_ids } = slidePlan;

  const bullets = [
    ...(cross_category_insights || []).slice(0, 4).map((ins) =>
      `${CATEGORY_LABELS[ins.category] || ins.category || ""}: ${(ins.insight || ins.signal || "").slice(0, 70)}`
    ),
    ...(outlook_statements || []).slice(0, 1).map((o) =>
      `Outlook: ${o.statement?.slice(0, 70)}`
    ),
  ].filter(Boolean).slice(0, 5);

  return {
    headline: core_message,
    bullets: bullets.length ? bullets : [core_message],
    evidence_callouts: [],
    visualization_ids: visualization_ids || [],
    citations: [],
  };
}

function deterministicFallback(slidePlan) {
  const { slide_type } = slidePlan;
  if (slide_type === "category_content") return deterministicCategoryContent(slidePlan);
  return deterministicOverviewContent(slidePlan);
}

// ── Content assembler ─────────────────────────────────────────────────────────

function assembleSlide(slidePlan, generated) {
  return {
    slide_number:       slidePlan.slide_number,
    slide_type:         slidePlan.slide_type,
    title:              generated.title || slidePlan.title,
    headline:           generated.headline || slidePlan.core_message,
    bullets:            (generated.bullets || []).slice(0, 5),
    evidence_callouts:  generated.evidence_callouts || [],
    visualization_ids:  generated.visualization_ids || slidePlan.visualization_ids || [],
    citations:          generated.citations || [],
    speaker_note_intent: slidePlan.speaker_note_intent,
    // keep plan fields for downstream use
    category:           slidePlan.category,
    core_message:       slidePlan.core_message,
    // keep raw plan data for QA
    _plan:              {
      rawfact_evidence_ids: (slidePlan.rawfact_evidence || []).map((e) => e.evidence_id),
      category_analysis_confidence: slidePlan.category_analysis?.analysis_confidence,
    },
  };
}

// ── Structural slide builders (no LLM) ────────────────────────────────────────

function buildTitleSlide(plan) {
  return {
    slide_number:       plan.slide_number,
    slide_type:         "title",
    title:              plan.title,
    headline:           plan.core_message,
    bullets:            [],
    evidence_callouts:  [],
    visualization_ids:  [],
    citations:          [],
    speaker_note_intent: plan.speaker_note_intent,
    category:           null,
    core_message:       plan.core_message,
  };
}

function buildSectionDivider(plan) {
  return {
    slide_number:        plan.slide_number,
    slide_type:          "section_divider",
    title:               plan.title,
    headline:            plan.core_message,
    bullets:             [],
    evidence_callouts:   [],
    visualization_ids:   [],
    citations:           [],
    speaker_note_intent: plan.speaker_note_intent,
    category:            plan.category,
    core_message:        plan.core_message,
  };
}

function buildAppendixSlide(plan, feedSources) {
  const top = [...(feedSources || [])]
    .sort((a, b) => (b.rawfact_score_data?.rawfact_score ?? b.feed_score_data?.feed_score ?? 0)
                  - (a.rawfact_score_data?.rawfact_score ?? a.feed_score_data?.feed_score ?? 0))
    .slice(0, 30);

  const citations = top.map((s) =>
    `[${(s.main_category || "").replace(/_/g, " ")}] ${(s.title || "").slice(0, 80)} — ${s.publisher || ""} (${s.url || ""})`
  );

  return {
    slide_number:       plan.slide_number,
    slide_type:         "appendix",
    title:              plan.title,
    headline:           plan.core_message,
    bullets:            [],
    evidence_callouts:  [],
    visualization_ids:  [],
    citations,
    speaker_note_intent: plan.speaker_note_intent,
    category:           null,
    core_message:       plan.core_message,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate slide content for all slides in the plan.
 *
 * @param {object[]} slidePlan    - Output of planSlides()
 * @param {object[]} feedSources  - All enriched sources (for appendix)
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]    - Force deterministic fallback
 * @param {number}   [opts.concurrency=3]    - Max parallel LLM calls
 * @returns {Promise<object[]>} Generated slide content objects
 */
export async function generateSlideContent(slidePlan, feedSources = [], opts = {}) {
  const { skipLlm = false, concurrency = 3 } = opts;

  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  const results = [];

  for (let i = 0; i < slidePlan.length; i += concurrency) {
    const batch = slidePlan.slice(i, i + concurrency);

    const batchResults = await Promise.all(batch.map(async (plan) => {
      // Structural slides — no LLM
      if (plan.slide_type === "title")           return buildTitleSlide(plan);
      if (plan.slide_type === "section_divider") return buildSectionDivider(plan);
      if (plan.slide_type === "appendix")        return buildAppendixSlide(plan, feedSources);

      if (!hasLlm) {
        return assembleSlide(plan, deterministicFallback(plan));
      }

      // Choose prompt builder based on slide type
      const isCategorySlide = plan.slide_type === "category_content";
      const userPrompt = isCategorySlide
        ? buildCategoryPrompt(plan)
        : buildCrossOrOutlookPrompt(plan);

      try {
        const raw = await callLLM(SYSTEM_PROMPT, userPrompt, {
          schema:   SLIDE_SCHEMA,
          logLabel: `Layer7-slide${plan.slide_number}-${plan.slide_type}`,
        });
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return assembleSlide(plan, parsed);
      } catch (err) {
        process.stdout.write(
          `  [Layer 7] LLM failed for slide ${plan.slide_number} (${plan.slide_type}): ${err.message} — using fallback\n`
        );
        return assembleSlide(plan, deterministicFallback(plan));
      }
    }));

    results.push(...batchResults);
  }

  return results;
}
