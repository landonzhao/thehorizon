/**
 * Layer 6 — Evidence Card Extraction
 *
 * LLM-based extraction of structured evidence cards for high-priority sources
 * (feed_priority "must_read" or "high"). Evidence cards are the atomic units
 * that slide-generation layers use for callouts, case studies, and citations.
 *
 * Falls back to a deterministic card (using Layer 5 understanding fields) when
 * LLM is unavailable or fails.
 */

import { callLLM } from "../../llm/callLLM.js";

// ── Structured output schema ──────────────────────────────────────────────────

const EVIDENCE_SCHEMA = {
  type: "object",
  required: [
    "evidence_card_title", "short_summary", "key_facts",
    "numbers_statistics", "attack_flow", "impacts",
    "why_it_matters", "best_used_for",
  ],
  properties: {
    evidence_card_title: { type: "string" },
    short_summary:       { type: "string" },
    key_facts:           { type: "array", items: { type: "string" } },
    numbers_statistics:  { type: "array", items: { type: "string" } },
    attack_flow:         { type: "array", items: { type: "string" } },
    impacts:             { type: "array", items: { type: "string" } },
    why_it_matters:      { type: "string" },
    best_used_for: {
      type: "array",
      items: {
        type: "string",
        enum: ["trend_support", "case_study", "outlook_support", "visual_annotation", "stat_callout"],
      },
    },
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior intelligence analyst extracting structured evidence from a cybersecurity source for use in a strategic AI threat briefing deck.

Your output will be placed directly on presentation slides. Precision and brevity are critical — no filler phrases.

## FIELDS

evidence_card_title
  A punchy, slide-ready title (≤10 words). Captures the most newsworthy aspect.
  Good: "GPT-4o Guardrails Bypassed via Base64 Injection"
  Bad: "Researchers demonstrate a new type of attack on AI systems"

short_summary
  1–2 sentences suitable for a slide body. What happened + why it matters. No fluff.

key_facts
  3–5 specific, verifiable facts from the source. Short declarative sentences.
  Only facts the source directly states — no inference.

numbers_statistics
  Quantitative data points with context. Format: "value: context"
  e.g. "87%: attack success rate against GPT-4o guardrails"
  Empty array if none present.

attack_flow
  Step-by-step attack sequence (if source describes one). Start each step with a verb.
  e.g. ["Embed malicious instruction in base64", "LLM decodes and executes payload", "Attacker achieves arbitrary output"]
  Empty array if not an attack/exploit source.

impacts
  1–3 concrete impact statements. What was compromised, damaged, or leaked?
  Empty array if no concrete impact described.

why_it_matters
  1 sentence. The strategic significance for defenders or decision-makers.
  Focus on: what defender action this calls for, or what threat shift it signals.

best_used_for
  1–3 tags indicating best slide use. Choose from:
  - trend_support — illustrates an ongoing trend
  - case_study — a specific real-world example
  - outlook_support — supports a forward-looking claim
  - visual_annotation — good for annotating a chart or timeline
  - stat_callout — a strong statistic worth highlighting

## RULES
- Return strict JSON only — no markdown, no explanation
- Do not invent facts not in the source
- If a field is not applicable, use an empty array or a neutral statement`;

// ── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(source) {
  const parts = [
    `TITLE: ${source.title || "(no title)"}`,
    `PUBLISHER: ${source.publisher || "unknown"}`,
    `DATE: ${source.date_published || "unknown"}`,
    `URL: ${source.url || ""}`,
    `CATEGORY: ${source.main_category || "unknown"}`,
    `SOURCE TYPE: ${source.source_type || "unknown"}`,
  ];

  const summary = source.understanding?.source_summary || source.summary || "";
  if (summary) parts.push(`\nANALYST SUMMARY: ${summary}`);

  const text = (source.clean_text || source.full_text || "").slice(0, 1800);
  if (text) parts.push(`\nSOURCE TEXT:\n${text}`);

  return parts.join("\n");
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function mockEvidenceCard(source) {
  const u = source.understanding || {};
  return {
    evidence_card_title:  (source.title || "").slice(0, 80),
    short_summary:        u.source_summary || source.title || "",
    key_facts:            (u.main_claims || []).slice(0, 3),
    numbers_statistics:   u.important_numbers || [],
    attack_flow:          [],
    impacts:              [],
    why_it_matters:       "Relevant to the AI threat landscape — see source for details.",
    best_used_for:        ["trend_support"],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 5;

/**
 * Extract evidence cards for high-priority sources.
 *
 * Only sources with feed_priority "must_read" or "high" receive an LLM call.
 * Lower-priority sources get `evidence_card: null`.
 * LLM calls run with bounded concurrency (default 5) to avoid rate-limit storms.
 *
 * @param {object[]} sources - Sources with `feed_score_data` from feedScoring.
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]   - Force deterministic fallback.
 * @param {number}   [opts.concurrency=5]   - Max parallel LLM calls.
 * @returns {Promise<object[]>} Sources with `evidence_card` field added.
 */
export async function extractEvidence(sources, opts = {}) {
  const { skipLlm = false, concurrency = DEFAULT_CONCURRENCY } = opts;
  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  async function processOne(source) {
    const priority = source.feed_score_data?.feed_priority;

    if (priority !== "must_read" && priority !== "high") {
      return { ...source, evidence_card: null };
    }

    if (!hasLlm) {
      return { ...source, evidence_card: mockEvidenceCard(source) };
    }

    try {
      const raw = await callLLM(SYSTEM_PROMPT, buildUserPrompt(source), {
        schema:   EVIDENCE_SCHEMA,
        logLabel: "Layer6-evidence",
      });
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { ...source, evidence_card: parsed };
    } catch (err) {
      process.stdout.write(
        `  [Layer 6] Evidence LLM failed for "${(source.title || "").slice(0, 60)}": ${err.message} — using mock\n`
      );
      return { ...source, evidence_card: mockEvidenceCard(source) };
    }
  }

  // Process in concurrent batches
  const results = new Array(sources.length);
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processOne));
    for (let j = 0; j < batch.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}
