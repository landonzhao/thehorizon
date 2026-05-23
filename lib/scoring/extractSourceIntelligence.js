/**
 * Extracts scoring signals from a source using LLM structured output.
 *
 * Returns an object matching SOURCE_INTELLIGENCE_SCHEMA: publisher_type,
 * event_type, evidence_level, exploitation_status, affected_ai_layer,
 * attack_novelty, geographic_scope.
 *
 * Idempotent: if source.llm_extracted_intelligence is already populated,
 * returns it immediately without making an API call.
 *
 * Provider rotation: OpenAI → OpenAI-2 → Groq → Gemini Flash → Gemini 2.5
 * Mirrors the rotation in lib/claims/enrichSource.js.
 */

import { SOURCE_INTELLIGENCE_SCHEMA } from "./sourceIntelligenceSchema.js";
import { PUBLISHER_TYPES, EVENT_TYPES } from "./relevanceRules.js";

const OPENAI_MODEL    = "gpt-4o-mini";
const GROQ_MODEL      = "llama-3.3-70b-versatile";
const GEMINI_FLASH    = "gemini-2.0-flash";
const GEMINI_PRO      = "gemini-2.5-flash";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function isRateLimit(status, body = "") {
  if (status !== 429) return false;
  return body.includes("rate_limit") || body.includes("Rate limit") || body.includes("try again");
}

function retryAfterMs(response, body = "") {
  const header = response.headers?.get?.("retry-after");
  if (header) return Math.min(parseInt(header, 10) * 1000, 30000);
  const match = body.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (match) return Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 500, 30000);
  return 4000;
}

function buildExtractionPrompt(source) {
  const snippet = String(source.full_text || source.summary || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  return `You are a security intelligence analyst. Classify this source for automated scoring by extracting the following fields. Return strict JSON only.

SOURCE METADATA
title: ${source.title || ""}
publisher: ${source.publisher || ""}
source_type: ${source.source_type || ""}
date_published: ${source.date_published || ""}
tags: ${JSON.stringify(source.tags || [])}

SOURCE TEXT (truncated)
${snippet}

FIELD DEFINITIONS

publisher_type — what kind of organisation published this:
  "government_agency" — CISA, NCSC, CSA Singapore, NIST, CERT, government ministry
  "academic" — university research group, arXiv preprint, peer-reviewed journal
  "threat_intel_firm" — Mandiant, CrowdStrike, Recorded Future, Rapid7, SentinelOne Labs
  "security_vendor" — Trail of Bits, NCC Group, Wiz, PortSwigger, Bishop Fox, HiddenLayer
  "major_vendor" — Microsoft, Google, Amazon, Apple, Meta, Anthropic, OpenAI (when reporting on own products)
  "independent_researcher" — individual security researcher or blogger (embracethered.com, simonwillison.net)
  "news_media" — BleepingComputer, The Record, SecurityWeek, Ars Technica, Wired
  "community_aggregator" — Hacker News, Reddit, newsletter roundup
  "unknown" — unclear or not determinable

event_type — primary event or document type:
  "active_exploitation" — confirmed in-the-wild exploitation of a vulnerability or technique
  "vulnerability_disclosure" — CVE or security advisory; vulnerability found but not necessarily exploited
  "research_finding" — academic or practitioner research paper or technical blog demonstrating an attack
  "threat_actor_report" — threat intelligence report attributing activity to a specific actor or campaign
  "policy_advisory" — government or regulatory guidance, security framework, compliance requirement
  "incident_report" — post-incident analysis or breach disclosure without attribution to a specific technique
  "analysis_essay" — opinion, analysis, trend piece, or explainer without new technical finding
  "product_announcement" — product launch, feature release, or marketing material
  "low_value_noise" — roundup, generic overview, or content with no specific intelligence value
  "unrelated" — not about AI, ML, or cybersecurity

evidence_level — strongest evidence for the claimed threat or finding:
  "confirmed_exploitation" — exploitation confirmed by a trusted source with technical evidence
  "attributed_incident" — incident attributed to a specific actor with corroborating evidence
  "poc_available" — proof-of-concept exploit or demonstration exists
  "vendor_confirmed" — vendor acknowledged the vulnerability or issue
  "theoretical" — attack theorised or described without demonstrated exploitation
  "unverified_claim" — claim made without supporting evidence or source citation

exploitation_status:
  "exploited_in_wild" — confirmed real-world exploitation
  "poc_available" — PoC exists but no confirmed exploitation
  "not_exploited" — explicitly stated as not exploited
  "unknown" — exploitation status not addressed

affected_ai_layer — which AI system layers are targeted (select all that apply; empty array if none):
  "llm_inference" — the LLM model itself (prompt injection, jailbreak, output manipulation)
  "agent_orchestration" — agentic frameworks, multi-agent pipelines, task orchestration
  "training_pipeline" — model training data, fine-tuning, or training infrastructure
  "model_weights" — trained model checkpoints, serialised model files
  "plugin_tool" — LLM plugins, function calling, tool integrations
  "mcp_server" — Model Context Protocol server implementations
  "embedding_model" — embedding generation or vector database components
  "inference_api" — inference serving infrastructure, API endpoints

attack_novelty:
  "novel_technique" — technique not previously publicly documented
  "new_variant" — known technique applied with a meaningful new twist or target
  "known_technique_new_target" — established attack applied to a new AI system or domain
  "established" — well-documented technique with no novel aspect

geographic_scope — regions mentioned as targets or context (lowercase strings, e.g. "singapore", "asean", "us", "eu", "global", "uk"):

Return only this JSON with no markdown:
${JSON.stringify({
  publisher_type: "unknown",
  event_type: "analysis_essay",
  evidence_level: "unverified_claim",
  exploitation_status: "unknown",
  affected_ai_layer: [],
  attack_novelty: "established",
  geographic_scope: [],
}, null, 2)}`;
}

const VALID_PUBLISHER_TYPES = new Set(PUBLISHER_TYPES);
const VALID_EVENT_TYPES = new Set(EVENT_TYPES);
const VALID_EVIDENCE_LEVELS = new Set(["confirmed_exploitation", "poc_available", "theoretical", "vendor_confirmed", "attributed_incident", "unverified_claim"]);
const VALID_EXPLOITATION_STATUSES = new Set(["exploited_in_wild", "poc_available", "not_exploited", "unknown"]);
const VALID_AI_LAYERS = new Set(["llm_inference", "agent_orchestration", "training_pipeline", "model_weights", "plugin_tool", "mcp_server", "embedding_model", "inference_api"]);
const VALID_NOVELTY_VALUES = new Set(["novel_technique", "new_variant", "known_technique_new_target", "established"]);

function validateIntel(raw) {
  return {
    publisher_type: VALID_PUBLISHER_TYPES.has(raw?.publisher_type) ? raw.publisher_type : "unknown",
    event_type: VALID_EVENT_TYPES.has(raw?.event_type) ? raw.event_type : "analysis_essay",
    evidence_level: VALID_EVIDENCE_LEVELS.has(raw?.evidence_level) ? raw.evidence_level : "unverified_claim",
    exploitation_status: VALID_EXPLOITATION_STATUSES.has(raw?.exploitation_status) ? raw.exploitation_status : "unknown",
    affected_ai_layer: Array.isArray(raw?.affected_ai_layer)
      ? raw.affected_ai_layer.filter((l) => VALID_AI_LAYERS.has(l))
      : [],
    attack_novelty: VALID_NOVELTY_VALUES.has(raw?.attack_novelty) ? raw.attack_novelty : "established",
    geographic_scope: Array.isArray(raw?.geographic_scope)
      ? raw.geographic_scope.filter((s) => typeof s === "string").map((s) => s.toLowerCase())
      : [],
  };
}

async function callOpenAICompat(source, { baseUrl, apiKey, model, label, useStructuredOutput }) {
  const MAX_RETRIES = 3;

  const body = {
    model,
    messages: [{ role: "user", content: buildExtractionPrompt(source) }],
    temperature: 0,
  };

  if (useStructuredOutput) {
    body.response_format = {
      type: "json_schema",
      json_schema: SOURCE_INTELLIGENCE_SCHEMA,
    };
  } else {
    body.response_format = { type: "json_object" };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "{}";
      return JSON.parse(text);
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

    throw new Error(`${label} intel extraction failed: ${response.status} ${msg}`);
  }
}

async function callGeminiModel(source, model, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildExtractionPrompt(source) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      return JSON.parse(text);
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

    throw new Error(`Gemini ${model} intel extraction failed: ${response.status}`);
  }
}

function buildProviders() {
  const providers = [];

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      label: "OpenAI",
      fn: (s) => callOpenAICompat(s, {
        baseUrl: "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
        model: OPENAI_MODEL,
        label: "OpenAI",
        useStructuredOutput: true,
      }),
    });
  }

  if (process.env.OPENAI_API_KEY_2) {
    providers.push({
      label: "OpenAI-2",
      fn: (s) => callOpenAICompat(s, {
        baseUrl: "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY_2,
        model: OPENAI_MODEL,
        label: "OpenAI-2",
        useStructuredOutput: true,
      }),
    });
  }

  if (process.env.GROQ_API_KEY) {
    providers.push({
      label: "Groq",
      fn: (s) => callOpenAICompat(s, {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        model: GROQ_MODEL,
        label: "Groq",
        useStructuredOutput: false,
      }),
    });
  }

  if (process.env.GEMINI_API_KEY) {
    providers.push(
      { label: "Gemini Flash",  fn: (s) => callGeminiModel(s, GEMINI_FLASH, process.env.GEMINI_API_KEY) },
      { label: "Gemini 2.5",   fn: (s) => callGeminiModel(s, GEMINI_PRO,   process.env.GEMINI_API_KEY) },
    );
  }

  if (process.env.GEMINI_API_KEY_2) {
    providers.push(
      { label: "Gemini Flash-2", fn: (s) => callGeminiModel(s, GEMINI_FLASH, process.env.GEMINI_API_KEY_2) },
      { label: "Gemini 2.5-2",   fn: (s) => callGeminiModel(s, GEMINI_PRO,   process.env.GEMINI_API_KEY_2) },
    );
  }

  return providers;
}

export async function extractSourceIntelligence(source) {
  // Idempotent: skip extraction if already done
  if (source.llm_extracted_intelligence && source.llm_extracted_intelligence.event_type) {
    return source.llm_extracted_intelligence;
  }

  const providers = buildProviders();

  if (providers.length === 0) {
    return null;
  }

  let lastErr;
  for (const provider of providers) {
    try {
      const raw = await provider.fn(source);
      return validateIntel(raw);
    } catch (err) {
      lastErr = err;
      if (err.isQuota) {
        process.stdout.write(` [${provider.label} quota→next]`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error("All intel extraction providers exhausted");
}
