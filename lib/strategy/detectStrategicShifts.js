/**
 * LLM-driven strategic shift detection.
 *
 * Takes the synthesised trends and asks an LLM to identify the 3-6 most
 * significant shifts in the threat landscape this month: what assumption
 * has changed, what the emerging reality is, and what it means for defenders.
 *
 * This is the core of the monthly horizon scan.
 */

import { MATURITY_LEVELS, CONFIDENCE_LEVELS } from "../events/synthesiseEvent.js";
import { recordTokens } from "../utils/tokenUsage.js";

const STEP = "strategic_shifts";

const OPENAI_MODEL = "gpt-4o-mini";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GEMINI_FLASH = "gemini-2.0-flash";
const GEMINI_PRO   = "gemini-2.5-flash";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildShiftPrompt(trends, period) {
  const trendSummaries = trends
    .sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0))
    .slice(0, 10)
    .map((t, i) => `Trend ${i + 1}: ${t.trend_title || t.trend_id}
Categories: ${(t.threat_categories || []).join(", ")} | Maturity: ${t.maturity_level} | Trajectory: ${t.trajectory} | Strength: ${t.trend_strength}
Summary: ${(t.summary || "").slice(0, 500)}
Strategic significance: ${(t.strategic_significance || "").slice(0, 300)}`)
    .join("\n\n");

  return `You are a senior AI threat intelligence analyst producing a monthly horizon scanning report for CISOs, cyber defenders, and policymakers.

Reporting period: ${period}

Based on the following ${trends.length} synthesised trends from this period, identify the 3-6 most significant STRATEGIC SHIFTS in the AI threat landscape.

A strategic shift is NOT an incident or a vulnerability. It is a directional change in the threat landscape that invalidates a previous assumption about security, risk, or AI system behaviour.

Examples of strategic shifts:
- "AI orchestration layers have become enterprise attack surfaces, not just research curiosities"
- "Prompt injection is evolving from model manipulation into tool and data exfiltration"
- "AI coding assistants are introducing a new class of production infrastructure risk"
- "Deepfake capabilities have crossed the threshold needed for enterprise identity fraud"

Do NOT:
- List incidents as strategic shifts
- Summarise trends without identifying what changed
- Use hype language or speculation about AGI
- Repeat the same shift in different words

${trendSummaries}

Return strict JSON only — an array of shift objects.

Each shift must have:
- shift_title: Precise directional title (12-20 words)
- previous_assumption: What the security community or defenders assumed before this month's evidence
- emerging_reality: What the evidence now indicates is true or becoming true
- supporting_trend_titles: Array of trend titles that support this shift (from the trends above)
- implications_for_defenders: Specific, actionable implication — what defenders need to re-assess or change
- confidence_level: One of: ${CONFIDENCE_LEVELS.join(", ")}
- maturity_level: One of: ${MATURITY_LEVELS.join(", ")}
- expected_watch_window: How long before this shift fully materialises (e.g. "1-3 months", "6-12 months")
- singapore_asean_relevance: true or false
- why_this_matters: One paragraph. Why this shift is significant beyond the immediate incident level.

Return: { "strategic_shifts": [ {...}, {...} ] }`;
}

// ── Provider helpers ──────────────────────────────────────────────────────────

function isQuotaExhausted(status, body = "") {
  return status === 429 && (body.includes("insufficient_quota") || body.includes("RESOURCE_EXHAUSTED") || body.includes("billing"));
}

function isNetworkError(err) {
  const code = err?.cause?.code || err?.code || "";
  return (
    code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ECONNRESET" ||
    code === "ETIMEDOUT" || err?.message?.includes("fetch failed")
  );
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
    const r = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.3, max_tokens: 4000 }),
    });
    if (r.ok) {
      const data = await r.json();
      recordTokens({ step: STEP, provider: opts.label, prompt_tokens: data.usage?.prompt_tokens ?? 0, completion_tokens: data.usage?.completion_tokens ?? 0 });
      return JSON.parse(data.choices?.[0]?.message?.content || "{}");
    }
    const err = await r.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (isQuotaExhausted(r.status, msg)) throw Object.assign(new Error(`${opts.label}: quota`), { isQuota: true });
    if (r.status === 429 && attempt < 2) { await sleep(retryAfterMs(r, msg)); continue; }
    throw new Error(`${opts.label} failed: ${r.status}`);
  }
}

async function callGemini(prompt, model, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json", maxOutputTokens: 8000 } }) });
    if (r.ok) {
      const data = await r.json();
      recordTokens({ step: STEP, provider: model.includes("2.5") ? "Gemini 2.5" : "Gemini Flash", prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0, completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0 });
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    }
    const body = await r.text().catch(() => "");
    if (isQuotaExhausted(r.status, body)) throw Object.assign(new Error("Gemini quota"), { isQuota: true });
    if (r.status === 429 && attempt < 2) { await sleep(retryAfterMs(r, body)); continue; }
    throw new Error(`Gemini ${model} failed: ${r.status}`);
  }
}

function buildProviders() {
  const p = [];
  if (process.env.OPENAI_API_KEY)   p.push({ label: "OpenAI",   fn: (pr) => callOpenAI(pr, { baseUrl: "https://api.openai.com/v1",      apiKey: process.env.OPENAI_API_KEY,   model: OPENAI_MODEL, label: "OpenAI" }) });
  if (process.env.OPENAI_API_KEY_2) p.push({ label: "OpenAI-2", fn: (pr) => callOpenAI(pr, { baseUrl: "https://api.openai.com/v1",      apiKey: process.env.OPENAI_API_KEY_2, model: OPENAI_MODEL, label: "OpenAI-2" }) });
  if (process.env.GROQ_API_KEY)     p.push({ label: "Groq",     fn: (pr) => callOpenAI(pr, { baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY,     model: GROQ_MODEL,   label: "Groq" }) });
  if (process.env.GEMINI_API_KEY)   p.push({ label: "Gemini",   fn: (pr) => callGemini(pr, GEMINI_FLASH, process.env.GEMINI_API_KEY) }, { label: "Gemini-Pro", fn: (pr) => callGemini(pr, GEMINI_PRO, process.env.GEMINI_API_KEY) });
  if (process.env.GEMINI_API_KEY_2) p.push({ label: "Gemini-B", fn: (pr) => callGemini(pr, GEMINI_FLASH, process.env.GEMINI_API_KEY_2) });
  return p;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateShift(raw) {
  return {
    shift_title:                String(raw?.shift_title || "").trim().slice(0, 300),
    previous_assumption:        String(raw?.previous_assumption || "").trim(),
    emerging_reality:           String(raw?.emerging_reality || "").trim(),
    supporting_trend_titles:    Array.isArray(raw?.supporting_trend_titles) ? raw.supporting_trend_titles.filter(Boolean) : [],
    implications_for_defenders: String(raw?.implications_for_defenders || "").trim(),
    confidence_level:           CONFIDENCE_LEVELS.includes(raw?.confidence_level) ? raw.confidence_level : "medium",
    maturity_level:             MATURITY_LEVELS.includes(raw?.maturity_level) ? raw.maturity_level : "emerging",
    expected_watch_window:      String(raw?.expected_watch_window || "3-6 months").trim(),
    singapore_asean_relevance:  Boolean(raw?.singapore_asean_relevance),
    why_this_matters:           String(raw?.why_this_matters || "").trim(),
  };
}

function deterministicShifts(trends) {
  // Fallback: top-3 trends become shifts with minimal content
  return trends.slice(0, 3).map((t) => ({
    shift_title:                t.trend_title || "Strategic development in AI security",
    previous_assumption:        "Prior threat models did not account for this attack surface.",
    emerging_reality:           t.strategic_significance || t.summary || "",
    supporting_trend_titles:    [t.trend_title].filter(Boolean),
    implications_for_defenders: t.defender_implications || "",
    confidence_level:           t.confidence_level || "low",
    maturity_level:             t.maturity_level || "emerging",
    expected_watch_window:      t.watch_window || "3-6 months",
    singapore_asean_relevance:  t.singapore_asean_relevance || false,
    why_this_matters:           t.strategic_significance || "",
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function detectStrategicShifts(trends, period = "this month") {
  const providers = buildProviders();
  if (providers.length === 0 || trends.length === 0) {
    return deterministicShifts(trends);
  }

  const prompt = buildShiftPrompt(trends, period);
  let lastErr;

  for (const provider of providers) {
    try {
      const raw = await provider.fn(prompt);
      const shifts = Array.isArray(raw?.strategic_shifts) ? raw.strategic_shifts : [];
      return shifts.slice(0, 6).map(validateShift).filter((s) => s.shift_title);
    } catch (err) {
      lastErr = err;
      if (err.isQuota)          { process.stdout.write(` [${provider.label} quota→next]`);    continue; }
      if (isNetworkError(err))  { process.stdout.write(` [${provider.label} network→next]`);  continue; }
      if (err instanceof SyntaxError) { process.stdout.write(` [${provider.label} parse-err→next]`); continue; }
      throw err;
    }
  }

  console.warn(`  Strategic shift detection fallback: ${lastErr?.message}`);
  return deterministicShifts(trends);
}
