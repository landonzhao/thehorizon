/**
 * LLM event synthesis.
 *
 * Takes a cluster of sources describing the same event and produces a
 * coherent event-level intelligence object: what happened, how, why it
 * matters, defender implications, and watch indicators.
 *
 * Provider rotation: same pattern as extractSourceIntelligence.js.
 * Deterministic fallback: if no LLM is available, uses the primary source's
 * existing short_summary / analyst_brief fields.
 */

const OPENAI_MODEL = "gpt-4o-mini";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GEMINI_FLASH = "gemini-2.0-flash";
const GEMINI_PRO   = "gemini-2.5-flash";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MATURITY_LEVELS = ["research", "emerging", "growing", "operational", "mainstream"];
const OP_LEVELS       = ["theoretical", "limited", "moderate", "widespread", "commoditised"];
const CONFIDENCE_LEVELS = ["low", "medium", "high"];

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildSynthesisPrompt(cluster) {
  const primary = cluster.sources[0];
  const supporting = cluster.sources.slice(1, 6);

  const sourceBlocks = [primary, ...supporting].map((s, i) => {
    const text = String(s.clean_text || s.full_text || s.summary || "")
      .replace(/\s+/g, " ").trim().slice(0, 1500);
    const intel = s.llm_extracted_intelligence || {};
    return `--- Source ${i + 1} [${s.trust_tier || "unknown"} / ${intel.publisher_type || "?"}] ---
Title: ${s.title || ""}
Publisher: ${s.publisher || ""} | Date: ${s.date_published?.slice(0, 10) || ""}
Event type: ${intel.event_type || ""} | Evidence: ${intel.evidence_level || ""} | Exploitation: ${intel.exploitation_status || ""}
Text: ${text}`;
  }).join("\n\n");

  const knownCves    = cluster.cve_ids.join(", ") || "none identified";
  const knownProducts = cluster.affected_products.slice(0, 8).join(", ") || "not specified";
  const knownActors   = cluster.threat_actors.slice(0, 5).join(", ") || "not attributed";

  return `You are a senior AI threat intelligence analyst writing for a monthly horizon scanning report read by CISOs, cyber defenders, and policymakers.

Synthesise the following ${cluster.sources.length} source(s) into a single coherent event intelligence object. The sources all describe the same real-world event or development.

Known facts from clustering:
- CVE IDs: ${knownCves}
- Affected products: ${knownProducts}
- Threat actors: ${knownActors}
- Evidence level (best across sources): ${cluster.evidence_level}
- Exploitation status: ${cluster.exploitation_status}

${sourceBlocks}

Return strict JSON only — no markdown, no code fences, no trailing commas.

Required fields:

event_title: A precise, specific title for this event (10-15 words). Include CVE IDs, product names, and technique names. Do not use generic titles like "AI Security Incident".

summary: Three sentences. Sentence 1: what happened and at what scale. Sentence 2: the technical mechanism. Sentence 3: the key implication for AI system defenders.

what_happened: Precise operational description. Name affected products, versions, CVEs, affected organisations, and scale. Include dates where known.

how_it_happened: Step-by-step technical explanation of the attack chain or vulnerability mechanism. Be specific about the entry point, technique, propagation path, and payload.

why_it_matters: Strategic significance for AI system operators and cyber defenders. Explain what assumption this breaks or what new attack surface this exposes.

defender_implications: Specific actions defenders should take or assess. Prioritise: immediate mitigations, detection opportunities, architectural review items.

watch_indicators: Array of 2-5 specific observable signals that would indicate this threat is evolving, escalating, or being replicated. Each indicator should be a concrete, monitorable signal.

maturity_level: One of: ${MATURITY_LEVELS.join(", ")}
  research = theoretical / academic only
  emerging = few demonstrations, no confirmed operational use
  growing = increasing PoC or limited operational use
  operational = confirmed real-world operational use
  mainstream = widely used by multiple actors or commodity tooling

operationalization_level: One of: ${OP_LEVELS.join(", ")}
  theoretical = attack described but not demonstrated
  limited = demonstrated by researchers, not operationalised
  moderate = used by sophisticated actors in limited campaigns
  widespread = used across multiple campaigns or actors
  commoditised = available in crimeware, kits, or common tooling

confidence_level: One of: ${CONFIDENCE_LEVELS.join(", ")} — your confidence in the synthesis given the source evidence

source_limitations: Any significant gaps, caveats, or uncertainties in the source evidence that affect reliability of this synthesis.

${JSON.stringify({
  event_title: "",
  summary: "",
  what_happened: "",
  how_it_happened: "",
  why_it_matters: "",
  defender_implications: "",
  watch_indicators: [],
  maturity_level: "emerging",
  operationalization_level: "theoretical",
  confidence_level: "medium",
  source_limitations: "",
}, null, 2)}`;
}

// ── Provider helpers (mirrors extractSourceIntelligence.js) ───────────────────

function isQuotaExhausted(status, body = "") {
  return status === 429 && (
    body.includes("insufficient_quota") ||
    body.includes("quota_exceeded") ||
    body.includes("RESOURCE_EXHAUSTED") ||
    body.includes("billing")
  );
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

async function callOpenAI(prompt, { baseUrl, apiKey, model, label }) {
  for (let attempt = 0; attempt <= 2; attempt++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      return JSON.parse(data.choices?.[0]?.message?.content || "{}");
    }
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (isQuotaExhausted(response.status, msg)) {
      throw Object.assign(new Error(`${label}: quota`), { isQuota: true });
    }
    if (response.status === 429 && attempt < 2) { await sleep(retryAfterMs(response, msg)); continue; }
    throw new Error(`${label} failed: ${response.status}`);
  }
}

async function callGemini(prompt, model, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });
    if (response.ok) {
      const data = await response.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    }
    const body = await response.text().catch(() => "");
    if (isQuotaExhausted(response.status, body)) {
      throw Object.assign(new Error(`Gemini quota`), { isQuota: true });
    }
    if (response.status === 429 && attempt < 2) { await sleep(retryAfterMs(response, body)); continue; }
    throw new Error(`Gemini ${model} failed: ${response.status}`);
  }
}

function buildProviders() {
  const providers = [];
  if (process.env.OPENAI_API_KEY)   providers.push({ label: "OpenAI",       fn: (p) => callOpenAI(p, { baseUrl: "https://api.openai.com/v1",      apiKey: process.env.OPENAI_API_KEY,   model: OPENAI_MODEL, label: "OpenAI" }) });
  if (process.env.OPENAI_API_KEY_2) providers.push({ label: "OpenAI-2",     fn: (p) => callOpenAI(p, { baseUrl: "https://api.openai.com/v1",      apiKey: process.env.OPENAI_API_KEY_2, model: OPENAI_MODEL, label: "OpenAI-2" }) });
  if (process.env.GROQ_API_KEY)     providers.push({ label: "Groq",         fn: (p) => callOpenAI(p, { baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY,     model: GROQ_MODEL,   label: "Groq" }) });
  if (process.env.GEMINI_API_KEY)   providers.push({ label: "Gemini Flash", fn: (p) => callGemini(p, GEMINI_FLASH, process.env.GEMINI_API_KEY) }, { label: "Gemini 2.5", fn: (p) => callGemini(p, GEMINI_PRO, process.env.GEMINI_API_KEY) });
  if (process.env.GEMINI_API_KEY_2) providers.push({ label: "Gemini-2",     fn: (p) => callGemini(p, GEMINI_FLASH, process.env.GEMINI_API_KEY_2) });
  return providers;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(raw) {
  return {
    event_title:              String(raw?.event_title || "").trim().slice(0, 200),
    summary:                  String(raw?.summary || "").trim(),
    what_happened:            String(raw?.what_happened || "").trim(),
    how_it_happened:          String(raw?.how_it_happened || "").trim(),
    why_it_matters:           String(raw?.why_it_matters || "").trim(),
    defender_implications:    String(raw?.defender_implications || "").trim(),
    watch_indicators:         Array.isArray(raw?.watch_indicators) ? raw.watch_indicators.filter(Boolean).slice(0, 5) : [],
    maturity_level:           MATURITY_LEVELS.includes(raw?.maturity_level) ? raw.maturity_level : "emerging",
    operationalization_level: OP_LEVELS.includes(raw?.operationalization_level) ? raw.operationalization_level : "theoretical",
    confidence_level:         CONFIDENCE_LEVELS.includes(raw?.confidence_level) ? raw.confidence_level : "medium",
    source_limitations:       String(raw?.source_limitations || "").trim(),
  };
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function deterministicSynthesis(cluster) {
  const primary = cluster.sources[0] || {};
  const brief = primary.analyst_brief || {};
  return {
    event_title:              primary.title || `Event: ${cluster.cve_ids[0] || cluster.event_id}`,
    summary:                  primary.short_summary || primary.summary || "",
    what_happened:            brief.what_happened || primary.summary || "",
    how_it_happened:          brief.how_it_happened || "",
    why_it_matters:           brief.why_it_matters || "",
    defender_implications:    (brief.watch_points || []).join("; "),
    watch_indicators:         brief.watch_points || [],
    maturity_level:           primary.intelligence?.threat_maturity || "emerging",
    operationalization_level: "theoretical",
    confidence_level:         "low",
    source_limitations:       "Synthesis derived from primary source only — no LLM synthesis available.",
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function synthesiseEvent(cluster) {
  const providers = buildProviders();
  if (providers.length === 0) return { ...cluster, ...deterministicSynthesis(cluster) };

  const prompt = buildSynthesisPrompt(cluster);
  let lastErr;

  for (const provider of providers) {
    try {
      const raw = await provider.fn(prompt);
      const synthesis = validate(raw);
      return { ...cluster, ...synthesis };
    } catch (err) {
      lastErr = err;
      if (err.isQuota)          { process.stdout.write(` [${provider.label} quota→next]`);       continue; }
      if (isNetworkError(err))  { process.stdout.write(` [${provider.label} network→next]`);     continue; }
      if (err instanceof SyntaxError) { process.stdout.write(` [${provider.label} parse-err→next]`); continue; }
      throw err;
    }
  }

  // All LLM providers failed — use deterministic fallback
  console.warn(`  Event synthesis fallback for ${cluster.event_id}: ${lastErr?.message}`);
  return { ...cluster, ...deterministicSynthesis(cluster) };
}

export { MATURITY_LEVELS, OP_LEVELS, CONFIDENCE_LEVELS };
