import { validateClaimExtraction, validateClassification, validateIntelligence } from "./validateClaims.js";
import { ALLOWED_TAGS } from "../classification/allowedTags.js";
import { cleanPlaintext } from "../cleaning/cleanPlaintext.js";

const OPENAI_MODEL       = "gpt-4o-mini";
const GROQ_MODEL         = "llama-3.3-70b-versatile";  // free tier, OpenAI-compatible
const GEMINI_FLASH_MODEL = "gemini-2.0-flash";          // cheaper/higher RPD than 2.5-flash
const GEMINI_MODEL       = "gemini-2.5-flash";          // best Gemini, used as final fallback

function trimText(text = "", maxChars = 12000) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function buildPrompt(source) {
  return `You are a senior AI security intelligence analyst. Your output feeds directly into publishable horizon scanning reports and automated trend analysis. Accuracy and structured extraction are more important than completeness — a precise partial answer is better than a comprehensive hallucinated one.

Audience: cybersecurity professionals, policy analysts, and decision-makers at government and enterprise level.

---

OUTPUT FORMAT
These rules apply to ALL string values inside the JSON, not to the JSON structure itself.
- Plain prose only. No markdown inside strings: no **bold**, no *italic*, no # headers, no bullet lists using *, -, or +.
- No LaTeX, no HTML entities (write & not &amp;), no special symbols (write "greater than or equal to" not >=, write "times" not x or *).
- ASCII punctuation only: period, comma, colon, semicolon, dash, parentheses, quotes.
- Return strict JSON only — no markdown fences, no code blocks, no extra keys, no trailing commas.

---

GENERAL REQUIREMENTS
- Preserve all numbers, dates, CVE IDs, version strings, organisation names, product names, threat actor names, sectors, and geographic references exactly as they appear.
- Explain the technical mechanism of any attack, exploit, or vulnerability — not just its name.
- Be concise and information-dense. Every sentence must add a fact not conveyed by another sentence.
- Do not invent, infer, or embellish beyond the source text. If the source is ambiguous, preserve the ambiguity.
- Distinguish confirmed facts from attributed claims and speculation: "researchers demonstrated..." vs "the vendor claims..." vs "the source speculates...".
- No marketing language, hype words ("revolutionary", "groundbreaking"), or filler phrases ("it is worth noting that").

---

SHORT SUMMARY
Exactly three sentences. Do not open with "This article", "This report", "The source", or any meta-reference.
- Sentence 1: The primary operational fact — who was targeted or affected, what happened, at what scale or with what impact. Include CVE IDs, affected versions, and breach scope where present.
- Sentence 2: The technical mechanism — how the attack worked or how the vulnerability is exploited, in one precise sentence.
- Sentence 3: The key implication for defenders, AI system operators, or the threat landscape.

---

ANALYST BRIEF
Each field must contain specific, verifiable content drawn directly from the source. Do not pad with generic statements.

what_happened: Precise technical description of the incident, vulnerability, or research finding. Name the specific product, model, API, protocol, or dataset affected.

who_was_affected: Named organisations, sectors, or user populations. Quantify where the source allows (e.g. "approximately 100,000 ChatGPT plugin users"). Write "not specified in source" if genuinely absent.

actor_or_attribution: Name the threat actor, criminal group, or nation-state. If attribution is partial or contested, state the basis (e.g. "attributed to Lazarus Group based on TTP overlap, not formally confirmed"). Write "unattributed" only when the source provides zero attribution evidence — never default to this to avoid uncertainty.

how_it_happened: Step-by-step technical explanation of the attack chain or vulnerability mechanism. Include the entry point, the technique, the propagation path, and the payload or effect. Be precise: name the parameter injected, the API endpoint abused, or the model behaviour exploited.

exploited_or_abused: The specific weakness, design flaw, misconfiguration, or AI capability that made the attack possible (e.g. "the LLM's instruction-following behaviour allowed an injected system prompt in a retrieved document to override the legitimate system prompt via role confusion").

impact: Quantified impact using numbers from the source. Include records exposed, systems compromised, financial loss, model capability degraded, or operational disruption. Write "impact not quantified in source" if absent.

why_it_matters: Why this development changes the threat landscape or analyst posture, specifically for AI systems, LLM deployments, agentic pipelines, or ML supply chains. One to three sentences. Do not write generic statements about the importance of security.

watch_points: 2 to 5 specific, observable indicators or developments defenders should track. Each must describe something concrete and actionable. Bad: "Monitor model outputs for anomalies." Good: "Watch for LLM API requests where the user message field contains base64-encoded text alongside a system prompt that grants tool-calling permissions — this pattern is consistent with indirect prompt injection via retrieved context."

---

INTELLIGENCE METADATA

trend_signals: 2 to 4 forward-looking observations about where AI threats are heading based on this source. Focus exclusively on what is NEW or CHANGING. Do not restate established facts. Be specific about the capability, technique, or threat actor behaviour that is advancing.

key_entities:
- threat_actors: named groups, individuals, or nation-states. Empty array if none identified.
- tools_and_techniques: specific tools, frameworks, models, protocols, or attack techniques named in the source (e.g. "GhostWriter", "LangChain AgentExecutor", "Pickle deserialization", "many-shot jailbreaking").
- affected_products: specific AI products, platforms, APIs, or model families directly involved (e.g. "Claude 3.5 Sonnet", "GPT-4o plugins", "Hugging Face transformers library v4.38").
- affected_organizations: named organisations, written exactly as in the source.
- cves: all CVE identifiers in the format ["CVE-2024-1234"]. Include every one mentioned.

threat_maturity: one of:
- "emerging": newly observed or theorised; limited or no confirmed real-world exploitation
- "growing": increasing in frequency or sophistication; being actively operationalised by threat actors
- "established": well-documented, widely understood, part of standard threat models
- "declining": being effectively mitigated by defences or losing threat actor interest

sector_impact: sectors most affected. Use only: "financial", "government", "healthcare", "critical_infrastructure", "technology", "defence", "education", "energy", "media", "legal", "retail".

horizon_relevance: integer 1 to 5:
- 5: Novel technique with no prior public documentation, or confirmed large-scale exploitation of an AI or ML system
- 4: New capability or research that directly enables attacks on AI systems; or a significant incident that demonstrates a previously theoretical threat
- 3: Important development that advances understanding of a known AI threat or confirms an emerging trend with new evidence
- 2: Background context, incremental update, policy announcement, or a well-understood threat with minor new details
- 1: Rehash of existing knowledge, opinion piece, or product announcement with no new intelligence value

report_tier: recommended reporting cadence:
- "weekly": time-sensitive and operationally actionable; warrants immediate analyst attention
- "monthly": significant trend, technique, or incident suitable for monthly threat review
- "quarterly": strategic, policy-level, or long-horizon significance with limited immediate operational impact
- "archive_only": background context; not report-worthy on its own

---

CLAIMS
Extract the most significant specific, falsifiable claims in the source. Skip vague or unsupported assertions.
- claim_text: the precise assertion (e.g. "GPT-4 was successfully jailbroken using the many-shot technique with a 97% success rate across 50 trials").
- claim_type: one of: incident, vulnerability, technical, severity, impact, attribution, mitigation, research, policy, prediction, opinion, other
- evidence_span: the verbatim or near-verbatim text from the source that supports this claim. Preserve numbers, technical terms, and product names exactly.
- confidence: integer 0 to 100 reflecting how well-evidenced the claim is in the source. 90 plus: directly stated with supporting data. 70 to 89: stated but incompletely evidenced. Below 70: inferred or speculative based on the source.

---

TAXONOMY
This classification determines how the source is routed and prioritised in the threat intelligence pipeline. Precision matters — imprecise tags corrupt downstream scoring and report generation.

Select tags ONLY from this exact allowed list:
${JSON.stringify(ALLOWED_TAGS)}

Tag selection rules:
- Only assign a tag if the technique or threat content is substantively covered, not merely mentioned.
- Do not assign a tag because the source is published by a company that works in that area.
- A CVE report for a product that uses AI gets 0 threat tags if the vulnerability is in a web framework and has no relationship to AI model behaviour.
- Multiple tags are correct and expected when multiple techniques are genuinely covered.

Tag disambiguation for commonly confused pairs:
- data_poisoning vs training_data_poisoning: data_poisoning targets classical ML training datasets (computer vision, tabular, NLP models). training_data_poisoning targets LLM pretraining corpora or fine-tuning datasets. Use based on the model type under attack.
- ml_supply_chain vs llm_supply_chain: ml_supply_chain covers malicious model files (Hugging Face pickle attacks, unsafe deserialisation of model checkpoints). llm_supply_chain covers LLM plugin ecosystems, fine-tuned model theft, or compromised LLM API dependencies.
- prompt_injection vs agent_hijacking: use prompt_injection when an LLM's instruction processing is manipulated via crafted input. Use agent_hijacking when the result is an autonomous agent being redirected to take unintended actions. Both apply when an injection causes an agent to act maliciously.
- excessive_agency vs tool_abuse: excessive_agency means the LLM or agent was granted too broad a permission scope and acted beyond its intended authority. tool_abuse means the LLM or agent was manipulated into making specific unauthorised tool or function calls. They often co-occur.
- model_theft vs model_extraction: model_theft involves stealing trained model weights or fine-tuned checkpoints. model_extraction involves reconstructing model behaviour through systematic query analysis without direct weight access.

ai_specificity_score: integer 0 to 100 measuring how central AI threats are to this source:
- 0 to 10: purely generic cybersecurity with no AI involvement (e.g. a CVE in a web server, an ICS advisory, ransomware that does not use AI)
- 11 to 19: AI mentioned incidentally; the core topic is traditional cybersecurity (e.g. a CVE report where the vendor happens to be an AI company but the vulnerability is in their web portal)
- 20 to 39: AI is a contributing factor but not the primary subject (e.g. an APT report that mentions AI-assisted phishing as one of several TTPs)
- 40 to 70: AI is a primary factor (an AI system was the attack surface, AI capabilities were abused, or the source is primarily about AI security)
- 71 to 100: AI or ML is the core subject (LLM attack research, adversarial ML, agentic AI exploitation, deepfake incidents, ML supply chain attacks)

Score calibration:
- Adversarial examples research paper targeting image classifiers: 85 to 95
- Jailbreak technique paper with demonstrated attacks against GPT-4 or Claude: 80 to 95
- Deepfake-based CEO fraud incident report: 70 to 85
- CISA advisory for a VPN vulnerability where the attacker used AI for reconnaissance: 15 to 25
- General threat intelligence report where AI tools are briefly mentioned in a list of attacker capabilities: 10 to 20
- SOC automation product announcement or AI-powered threat detection blog post: 10 to 20 (defensive AI, not threat intelligence)

ai_specificity_reason: one sentence under 25 words justifying the score.

---

SOURCE METADATA
${JSON.stringify(
  {
    title: source.title,
    publisher: source.publisher,
    source_type: source.source_type,
    date_published: source.date_published,
    existing_tags: source.tags || [],
  },
  null,
  2
)}

SOURCE TEXT
${trimText(cleanPlaintext(source.full_text || source.summary || source.short_summary || ""))}

---

Return strict JSON only — no markdown fences, no code blocks, no extra keys, no trailing commas:

{
  "short_summary": "...",

  "analyst_brief": {
    "what_happened": "...",
    "who_was_affected": "...",
    "actor_or_attribution": "...",
    "how_it_happened": "...",
    "exploited_or_abused": "...",
    "impact": "...",
    "why_it_matters": "...",
    "watch_points": ["...", "..."]
  },

  "claims": [
    {
      "claim_text": "...",
      "claim_type": "incident | vulnerability | technical | severity | impact | attribution | mitigation | research | policy | prediction | opinion | other",
      "evidence_span": "...",
      "confidence": 85
    }
  ],

  "intelligence": {
    "trend_signals": ["...", "..."],
    "key_entities": {
      "threat_actors": [],
      "tools_and_techniques": [],
      "affected_products": [],
      "affected_organizations": [],
      "cves": []
    },
    "threat_maturity": "emerging",
    "sector_impact": [],
    "horizon_relevance": 3,
    "report_tier": "monthly"
  },

  "classification": {
    "tags": ["tag_from_allowed_list"],
    "ai_specificity_score": 75,
    "ai_specificity_reason": "..."
  }
}`;
}

const EMPTY_CLASSIFICATION = () => validateClassification({});
const EMPTY_INTELLIGENCE = () => validateIntelligence({});

// ── Provider implementations ─────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// True quota exhaustion (daily/monthly limit) — skip the provider.
function isQuotaExhausted(status, body = "") {
  if (status !== 429) return false;
  return (
    body.includes("insufficient_quota") ||
    body.includes("quota_exceeded") ||
    body.includes("RESOURCE_EXHAUSTED") ||
    body.includes("exceeded your current quota") ||
    body.includes("billing")
  );
}

// Temporary rate limit (RPM/TPM) — wait and retry the same provider.
function isRateLimit(status, body = "") {
  if (status !== 429) return false;
  return body.includes("rate_limit") || body.includes("Rate limit") || body.includes("try again");
}

// Parse "retry after N seconds" from API response headers or body.
function retryAfterMs(response, body = "") {
  const header = response.headers?.get?.("retry-after");
  if (header) return Math.min(parseInt(header, 10) * 1000, 30000);
  const match = body.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (match) return Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 500, 30000);
  return 4000; // default: wait 4s before retry
}

// OpenAI-compatible: works for both OpenAI and Groq
async function callOpenAICompat(source, { baseUrl, apiKey, model, label }) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPrompt(source) }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "{}";
    }

    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || response.statusText || "";

    if (isQuotaExhausted(response.status, msg)) {
      throw Object.assign(new Error(`${label}: quota exhausted`), { isQuota: true });
    }

    if (isRateLimit(response.status, msg) && attempt < MAX_RETRIES) {
      const wait = retryAfterMs(response, msg);
      process.stdout.write(` [${label} rate-limit→wait ${Math.round(wait / 1000)}s]`);
      await sleep(wait);
      continue;
    }

    throw new Error(`${label} enrichment failed: ${response.status} ${msg}`);
  }
}

async function callGeminiModel(source, model, apiKey = process.env.GEMINI_API_KEY) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(source) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    }

    const body = await response.text().catch(() => "");

    if (isQuotaExhausted(response.status, body) || body.includes("RESOURCE_EXHAUSTED")) {
      throw Object.assign(new Error(`Gemini ${model}: quota exhausted`), { isQuota: true });
    }

    if (isRateLimit(response.status, body) && attempt < MAX_RETRIES) {
      const wait = retryAfterMs(response, body);
      process.stdout.write(` [Gemini rate-limit→wait ${Math.round(wait / 1000)}s]`);
      await sleep(wait);
      continue;
    }

    throw new Error(`Gemini ${model} enrichment failed: ${response.status}`);
  }
}

// ── Provider rotation ────────────────────────────────────────────────────────
// Tries each provider in order; skips on quota exhaustion, retries on rate limits.

function buildProviders() {
  const providers = [];

  if (process.env.OPENAI_API_KEY) {
    providers.push({ label: "OpenAI", fn: (s) => callOpenAICompat(s, {
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: OPENAI_MODEL,
      label: "OpenAI",
    })});
  }

  if (process.env.OPENAI_API_KEY_2) {
    providers.push({ label: "OpenAI-2", fn: (s) => callOpenAICompat(s, {
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY_2,
      model: OPENAI_MODEL,
      label: "OpenAI-2",
    })});
  }

  if (process.env.GROQ_API_KEY) {
    providers.push({ label: "Groq", fn: (s) => callOpenAICompat(s, {
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: GROQ_MODEL,
      label: "Groq",
    })});
  }

  if (process.env.GEMINI_API_KEY) {
    providers.push(
      { label: "Gemini Flash",   fn: (s) => callGeminiModel(s, GEMINI_FLASH_MODEL, process.env.GEMINI_API_KEY) },
      { label: "Gemini 2.5",     fn: (s) => callGeminiModel(s, GEMINI_MODEL,       process.env.GEMINI_API_KEY) },
    );
  }

  if (process.env.GEMINI_API_KEY_2) {
    providers.push(
      { label: "Gemini Flash-2", fn: (s) => callGeminiModel(s, GEMINI_FLASH_MODEL, process.env.GEMINI_API_KEY_2) },
      { label: "Gemini 2.5-2",   fn: (s) => callGeminiModel(s, GEMINI_MODEL,       process.env.GEMINI_API_KEY_2) },
    );
  }

  return providers;
}

export async function enrichSource(source) {
  const providers = buildProviders();

  if (providers.length === 0) {
    return {
      ...validateClaimExtraction({
        short_summary: source.summary || source.full_text?.slice(0, 500) || "No summary available.",
        analyst_brief: {},
        claims: [],
      }),
      classification: EMPTY_CLASSIFICATION(),
      intelligence: EMPTY_INTELLIGENCE(),
    };
  }

  let text;
  let lastErr;

  for (const provider of providers) {
    try {
      text = await provider.fn(source);
      break;
    } catch (err) {
      lastErr = err;
      if (err.isQuota) {
        process.stdout.write(` [${provider.label} quota→next]`);
        continue;
      }
      throw err;  // non-quota errors (auth, network) — bail immediately
    }
  }

  if (text === undefined) {
    throw lastErr || new Error("All enrichment providers exhausted");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      short_summary: source.summary || source.full_text?.slice(0, 500) || "No summary available.",
      analyst_brief: {},
      claims: [],
      classification: {},
    };
  }

  return {
    ...validateClaimExtraction(parsed),
    classification: validateClassification(parsed.classification || {}),
    intelligence: validateIntelligence(parsed.intelligence || {}),
  };
}
