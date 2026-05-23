/**
 * LLM trend synthesis.
 *
 * Takes a cluster of events and produces a trend-level intelligence object:
 * title, summary, trajectory, maturity, strategic significance, defender
 * implications, and next-month watch indicators.
 */

import { MATURITY_LEVELS, CONFIDENCE_LEVELS } from "../events/synthesiseEvent.js";

const OPENAI_MODEL = "gpt-4o-mini";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GEMINI_FLASH = "gemini-2.0-flash";
const GEMINI_PRO   = "gemini-2.5-flash";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRAJECTORIES = ["accelerating", "steady", "decelerating", "emerging", "plateauing"];
const TREND_STRENGTHS = ["weak", "moderate", "strong", "dominant"];

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildTrendPrompt(trend) {
  const eventSummaries = trend.events.slice(0, 8).map((e, i) => {
    return `Event ${i + 1}: ${e.event_title || e.event_id}
Type: ${e.event_type} | Evidence: ${e.evidence_level} | Maturity: ${e.maturity_level || "?"}
Summary: ${(e.summary || "").slice(0, 400)}`;
  }).join("\n\n");

  const ctx = {
    categories: trend.threat_categories.join(", "),
    tags: trend.dominant_tags.join(", "),
    layers: trend.affected_ai_stack_layers.join(", "),
    event_count: trend.supporting_event_ids.length,
    date_range: `${trend.first_seen?.slice(0,10)} to ${trend.latest_seen?.slice(0,10)}`,
    sg_relevant: trend.singapore_asean_relevance,
  };

  return `You are a senior AI threat intelligence analyst writing for a monthly horizon scanning report.

Synthesise the following ${ctx.event_count} related event(s) into a coherent trend analysis.

Trend context:
- Threat categories: ${ctx.categories}
- Dominant attack tags: ${ctx.tags}
- Affected AI stack layers: ${ctx.layers || "not specified"}
- Date range: ${ctx.date_range}
- Singapore/ASEAN relevance: ${ctx.sg_relevant}

Events in this trend:
${eventSummaries}

Return strict JSON only — no markdown, no code fences.

Required fields:

trend_title: A precise, directional title describing what is changing (not what exists). Use active language: "X is becoming Y" or "Z is expanding to W". 12-18 words.

summary: Four sentences. 1: What threat pattern connects these events. 2: How the pattern is evolving (direction, speed). 3: What new attack surface or defender assumption is being challenged. 4: Strategic implication for AI security teams.

evidence_summary: Describe the evidence base: how many events, what types (exploit, research, advisory), what evidence levels, and where geographically.

trend_strength: One of: ${TREND_STRENGTHS.join(", ")}. Weak = 1-2 events, limited signal. Moderate = 3-4 events, consistent pattern. Strong = 5+ events, corroborated. Dominant = high frequency and cross-sector.

maturity_level: One of: ${MATURITY_LEVELS.join(", ")}. Where is this technique/pattern in its lifecycle?

trajectory: One of: ${TRAJECTORIES.join(", ")}. Is this trend accelerating, steady, or slowing?

strategic_significance: Why does this trend matter at a strategic level? What organisational assumptions does it challenge?

operational_relevance: Concrete operational relevance for defenders. What specific actions, monitoring, or architecture reviews are indicated?

watch_window: How many months before this trend likely becomes higher urgency. Examples: "1-2 months", "3-6 months", "6-12 months", "already urgent".

defender_implications: Specific defensive posture changes indicated by this trend. Be concrete: monitoring, architecture, policy, tooling.

key_indicators_next_month: Array of 3-5 observable signals that would indicate this trend is intensifying. Each should be specific and monitorable.

confidence_level: One of: ${CONFIDENCE_LEVELS.join(", ")}.

${JSON.stringify({
  trend_title: "",
  summary: "",
  evidence_summary: "",
  trend_strength: "moderate",
  maturity_level: "emerging",
  trajectory: "steady",
  strategic_significance: "",
  operational_relevance: "",
  watch_window: "3-6 months",
  defender_implications: "",
  key_indicators_next_month: [],
  confidence_level: "medium",
}, null, 2)}`;
}

// ── Provider helpers ──────────────────────────────────────────────────────────

function isQuotaExhausted(status, body = "") {
  return status === 429 && (body.includes("insufficient_quota") || body.includes("RESOURCE_EXHAUSTED") || body.includes("billing"));
}

function retryAfterMs(response, body = "") {
  const h = response.headers?.get?.("retry-after");
  if (h) return Math.min(parseInt(h, 10) * 1000, 30000);
  const m = body.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1]) * 1000) + 500, 30000);
  return 4000;
}

async function callOpenAI(prompt, opts) {
  for (let attempt = 0; attempt <= 2; attempt++) {
    const response = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.2 }),
    });
    if (response.ok) return JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}");
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (isQuotaExhausted(response.status, msg)) throw Object.assign(new Error(`${opts.label}: quota`), { isQuota: true });
    if (response.status === 429 && attempt < 2) { await sleep(retryAfterMs(response, msg)); continue; }
    throw new Error(`${opts.label} failed: ${response.status}`);
  }
}

async function callGemini(prompt, model, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }) });
    if (response.ok) return JSON.parse((await response.json()).candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    const body = await response.text().catch(() => "");
    if (isQuotaExhausted(response.status, body)) throw Object.assign(new Error("Gemini quota"), { isQuota: true });
    if (response.status === 429 && attempt < 2) { await sleep(retryAfterMs(response, body)); continue; }
    throw new Error(`Gemini ${model} failed: ${response.status}`);
  }
}

function buildProviders() {
  const p = [];
  if (process.env.OPENAI_API_KEY)   p.push({ label: "OpenAI",   fn: (pr) => callOpenAI(pr, { baseUrl: "https://api.openai.com/v1",      apiKey: process.env.OPENAI_API_KEY,   model: OPENAI_MODEL, label: "OpenAI" }) });
  if (process.env.OPENAI_API_KEY_2) p.push({ label: "OpenAI-2", fn: (pr) => callOpenAI(pr, { baseUrl: "https://api.openai.com/v1",      apiKey: process.env.OPENAI_API_KEY_2, model: OPENAI_MODEL, label: "OpenAI-2" }) });
  if (process.env.GROQ_API_KEY)     p.push({ label: "Groq",     fn: (pr) => callOpenAI(pr, { baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY,     model: GROQ_MODEL,   label: "Groq" }) });
  if (process.env.GEMINI_API_KEY)   p.push({ label: "Gemini",   fn: (pr) => callGemini(pr, GEMINI_FLASH, process.env.GEMINI_API_KEY) }, { label: "Gemini-2.5", fn: (pr) => callGemini(pr, GEMINI_PRO, process.env.GEMINI_API_KEY) });
  if (process.env.GEMINI_API_KEY_2) p.push({ label: "Gemini-B", fn: (pr) => callGemini(pr, GEMINI_FLASH, process.env.GEMINI_API_KEY_2) });
  return p;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(raw) {
  return {
    trend_title:           String(raw?.trend_title || "").trim().slice(0, 250),
    summary:               String(raw?.summary || "").trim(),
    evidence_summary:      String(raw?.evidence_summary || "").trim(),
    trend_strength:        TREND_STRENGTHS.includes(raw?.trend_strength) ? raw.trend_strength : "moderate",
    maturity_level:        MATURITY_LEVELS.includes(raw?.maturity_level) ? raw.maturity_level : "emerging",
    trajectory:            TRAJECTORIES.includes(raw?.trajectory) ? raw.trajectory : "steady",
    strategic_significance: String(raw?.strategic_significance || "").trim(),
    operational_relevance: String(raw?.operational_relevance || "").trim(),
    watch_window:          String(raw?.watch_window || "3-6 months").trim(),
    defender_implications: String(raw?.defender_implications || "").trim(),
    key_indicators_next_month: Array.isArray(raw?.key_indicators_next_month)
      ? raw.key_indicators_next_month.filter(Boolean).slice(0, 5)
      : [],
    confidence_level:      CONFIDENCE_LEVELS.includes(raw?.confidence_level) ? raw.confidence_level : "medium",
  };
}

function deterministicSynthesis(trend) {
  const topEvent = trend.events[0] || {};
  return {
    trend_title:           `Trend: ${trend.dominant_tags[0] || trend.threat_categories[0] || "AI Security"} across ${trend.supporting_event_ids.length} events`,
    summary:               topEvent.summary || "",
    evidence_summary:      `${trend.supporting_event_ids.length} events across ${trend.threat_categories.join(", ")}`,
    trend_strength:        trend.supporting_event_ids.length >= 5 ? "strong" : trend.supporting_event_ids.length >= 3 ? "moderate" : "weak",
    maturity_level:        topEvent.maturity_level || "emerging",
    trajectory:            "steady",
    strategic_significance: topEvent.why_it_matters || "",
    operational_relevance: topEvent.defender_implications || "",
    watch_window:          "3-6 months",
    defender_implications: topEvent.defender_implications || "",
    key_indicators_next_month: topEvent.watch_indicators || [],
    confidence_level:      "low",
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function synthesiseTrend(trend) {
  const providers = buildProviders();
  if (providers.length === 0) return { ...trend, ...deterministicSynthesis(trend) };

  const prompt = buildTrendPrompt(trend);
  let lastErr;

  for (const provider of providers) {
    try {
      const raw = await provider.fn(prompt);
      return { ...trend, ...validate(raw) };
    } catch (err) {
      lastErr = err;
      if (err.isQuota) { process.stdout.write(` [${provider.label} quota→next]`); continue; }
      throw err;
    }
  }

  console.warn(`  Trend synthesis fallback for ${trend.trend_id}: ${lastErr?.message}`);
  return { ...trend, ...deterministicSynthesis(trend) };
}

export { TRAJECTORIES, TREND_STRENGTHS };
