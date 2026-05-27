/**
 * Layer 5 — Source Taxonomy + LLM Understanding
 *
 * Tags every source against the controlled framework taxonomy and assigns
 * source_type. Does NOT assign final main_category — that is Layer 6's job.
 *
 * ── LLM CALL ─────────────────────────────────────────────────────────────────
 * Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 * Models:  gpt-4o-mini  (OPENAI_API_KEY primary, OPENAI_API_KEY_2 secondary)
 *          llama-3.3-70b-versatile  (GROQ_API_KEY — JSON mode, no schema)
 *          gemini-2.0-flash / gemini-2.5-flash  (GEMINI_API_KEY / GEMINI_API_KEY_2)
 * Trigger: any of the above env vars present AND skipLlm=false
 * Output:  structured JSON via json_schema response_format (TAXONOMY_SCHEMA)
 * Label:   "Layer5-taxonomy"
 *
 * Prompt:  buildSystemPrompt() — built once and cached at _systemPromptCache.
 *          Includes the full controlled taxonomy registry from taxonomyRegistry.js.
 *          User prompt: buildUserPrompt(source, detType) — title, publisher, date,
 *          pre-classification hint, summary, source text (≤2500 chars), tags.
 *
 * Fallback (no keys or skipLlm=true):
 *   deterministicFallback() — uses classifySourceType() for source_type,
 *   keyword matching for category_candidates, empty arrays for tags/claims.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * Fields added to source:
 *   source.source_type          — Layer 5 type assignment (top-level)
 *   source.taxonomy_version     — idempotency stamp ("taxonomy-v5.0")
 *   source.understanding        — full taxonomy payload
 *     .source_type_confidence   — high | medium | low
 *     .source_type_reason       — brief explanation
 *     .source_summary           — 2–3 sentence analyst summary
 *     .primary_subject          — ≤15 words
 *     .main_claims              — 2–5 factual claims from source
 *     .key_entities             — named systems, orgs, CVEs, groups
 *     .important_numbers        — quantitative data
 *     .framework_tags           — validated controlled taxonomy tags
 *     .category_candidates      — suggested categories (Layer 6 picks the winner)
 *     .llm_used                 — boolean
 *     .taxonomy_version         — version stamp
 *
 * Idempotent: sources already stamped with TAXONOMY_VERSION are skipped.
 */

import { callLLM }             from "../../llm/callLLM.js";
import { classifySourceType }  from "../classify/classifySourceType.js";
import { ALL_SOURCE_TYPES }    from "../../config/sourceTypes.js";
import { CLASSIFIABLE_CATEGORIES } from "../../config/categories.js";
import {
  validateTags,
  validateAttackMappings,
  validateGovernanceTags,
  buildTaxonomyContextForPrompt,
} from "../../config/taxonomyRegistry.js";

export const TAXONOMY_VERSION = "taxonomy-v6.0";

// Back-compat alias: the runner and store still import UNDERSTAND_VERSION
export const UNDERSTAND_VERSION = TAXONOMY_VERSION;

// ── Structured output schema ──────────────────────────────────────────────────

const TAXONOMY_SCHEMA = {
  type: "object",
  required: [
    "source_type", "source_type_confidence", "source_type_reason",
    "source_summary", "primary_subject", "main_claims",
    "key_entities", "important_numbers",
    "framework_tags", "category_candidates",
  ],
  properties: {
    source_type:            { type: "string" },
    source_type_confidence: { type: "string", enum: ["high", "medium", "low"] },
    source_type_reason:     { type: "string" },
    source_summary:         { type: "string" },
    primary_subject:        { type: "string" },
    main_claims:            { type: "array", items: { type: "string" } },
    key_entities:           { type: "array", items: { type: "string" } },
    important_numbers:      { type: "array", items: { type: "string" } },
    framework_tags: {
      type: "array",
      items: {
        type: "object",
        required: ["tag", "framework", "framework_ref", "evidence", "confidence"],
        properties: {
          tag:               { type: "string" },
          category_candidate: { type: "string" },
          framework:         { type: "string" },
          framework_ref:     { type: "string" },
          evidence:          { type: "string" },
          confidence:        { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    attack_mappings: {
      type: "array",
      items: {
        type: "object",
        required: ["tag", "framework", "framework_ref", "tactic", "evidence", "confidence"],
        properties: {
          tag:           { type: "string" },
          framework:     { type: "string" },
          framework_ref: { type: "string" },
          tactic:        { type: "string" },
          evidence:      { type: "string" },
          confidence:    { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    governance_tags: {
      type: "array",
      items: {
        type: "object",
        required: ["tag", "framework", "framework_ref", "evidence", "confidence"],
        properties: {
          tag:           { type: "string" },
          framework:     { type: "string" },
          framework_ref: { type: "string" },
          evidence:      { type: "string" },
          confidence:    { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    category_candidates: {
      type: "array",
      items: {
        type: "object",
        required: ["category", "supporting_tags", "confidence", "reason"],
        properties: {
          category:       { type: "string" },
          supporting_tags: { type: "array", items: { type: "string" } },
          confidence:     { type: "string", enum: ["high", "medium", "low"] },
          reason:         { type: "string" },
        },
      },
    },
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const taxonomyContext = buildTaxonomyContextForPrompt();

  return `You are enriching a source for an AI-cyber horizon scan.

Your task is NOT keyword tagging.

Your task is to understand what the source is actually about, then assign controlled taxonomy tags only when they genuinely apply.

Use only these taxonomy frameworks:
- OWASP Top 10 for LLM Applications / OWASP GenAI
- MITRE ATLAS
- MITRE ATT&CK
- NIST AI RMF
- INTERNAL only if no external framework fits

Do NOT use OECD AI Incidents or any framework not listed above.

## ALLOWED TAXONOMY TAGS

You MUST only use tags from this controlled registry:

${taxonomyContext}

## STEP 1 — UNDERSTAND THE SOURCE

First, read and understand what the source is actually about. Produce:
- source_summary: 2–3 sentences, analyst-grade. What happened, the AI security significance, and who is affected. No filler phrases.
- primary_subject: ≤15 words describing the core subject.
- main_claims: 2–5 short declarative sentences that the source directly supports. Only facts the source explicitly states.
- key_entities: named organisations, tools, threat groups, CVE IDs, model names, APIs. Max 10 strings.
- important_numbers: quantitative data. Format "value: context". Max 5. Empty array if none.

## STEP 2 — ASSIGN SOURCE TYPE

Choose exactly one source_type from:
- vulnerability — CVE disclosures, advisories, patches for AI/ML systems or frameworks
- exploit_disclosure — Working exploits, PoC code, jailbreak techniques, bypass demonstrations
- incident — Confirmed real-world breaches, AI-enabled attack campaigns, operational compromises
- threat_intelligence — Threat actor profiles, TTPs, IOCs, campaign attribution
- research_finding — Novel security research (academic papers, vendor research, arXiv preprints, blogs)
- defensive_capability — Detection methods, mitigations, hardening guides, security controls
- benchmark_evaluation — Red team results, safety evaluations, model capability benchmarks
- capability_demonstration — Proof-of-concept capabilities shown to work; not yet observed in the wild
- adversary_adoption_signal — Evidence of adversaries adopting or operationalising AI capabilities
- infrastructure_dependency_signal — Dependency growth creating new attack surface (MCP servers, AI APIs, model hubs)
- trust_boundary_shift — Shifts in trust assumptions that create new exploit conditions
- societal_harm_signal — Confirmed societal harms from AI-enabled abuse: deepfake fraud, disinformation impact
- governance_signal — Government advisories, regulatory requirements, AI governance frameworks, compliance mandates
- ecosystem_signal — Ecosystem/market shifts: adoption trends, platform integrations, tooling changes
- strategic_signal — Long-range risk assessments, strategic trajectory analysis, convergence signals
- unknown — Cannot determine from available content

## STEP 3 — ASSIGN FRAMEWORK TAGS (framework_tags field)

framework_tags is ONLY for AI-specific risk patterns:
  OWASP LLM Top 10, OWASP GenAI, MITRE ATLAS, INTERNAL tags.
DO NOT put MITRE ATT&CK or NIST AI RMF tags in framework_tags — those have their own fields.

Rules — these are MANDATORY:
1. Do not tag based only on keyword appearance.
2. Tag only if the source substantively discusses the risk, technique, vulnerability, or governance issue.
3. Each tag must include evidence: one sentence explaining why it applies to THIS source.
4. If a term is mentioned only in passing or as background, do not tag it.
5. Infer carefully from system names: MCP, LangChain, LangGraph, CrewAI, Semantic Kernel, OpenAI Agents SDK, Claude Code, AutoGPT, ChatGPT, Gemini, Copilot, Hugging Face.
6. Do not over-tag. Quality over quantity. Max 5 tags per source.
7. Return empty array if no controlled tag clearly applies.
8. You MUST use only tags from the FRAMEWORK TAGS section of the registry above.

## STEP 4 — ASSIGN ATTACK MAPPINGS (attack_mappings field)

attack_mappings is for MITRE ATT&CK cyber operation behaviours ONLY.
Use this when the source describes a specific attack technique or tactic that maps to ATT&CK.
DO NOT put OWASP, MITRE ATLAS, or NIST tags here.

Rules:
1. Only use tags from the ATTACK MAPPINGS section of the registry.
2. Include evidence: one sentence explaining why the ATT&CK technique applies.
3. Populate tactic from the registry entry (e.g. "Initial Access", "Execution").
4. Max 5 attack mappings. Empty array if source does not describe operational attack techniques.
5. Prefer mappings with direct evidence — not speculative inference.

## STEP 5 — ASSIGN GOVERNANCE TAGS (governance_tags field)

governance_tags is for NIST AI RMF lenses ONLY.
Use this when the source is directly relevant to AI risk governance, evaluation, or management.
DO NOT put OWASP, MITRE ATLAS, or ATT&CK tags here.

Rules:
1. Only use tags from the GOVERNANCE TAGS section of the registry (nist_govern, nist_map, nist_measure, nist_manage).
2. Include evidence: one sentence explaining the governance relevance.
3. Max 3 governance tags. Empty array if source has no governance relevance.
4. Most technical research sources will have empty governance_tags. Only use for sources that explicitly address risk management, policy, compliance, or governance frameworks.

## STEP 6 — SUGGEST CATEGORY CANDIDATES

Based on the source's actual substance (not keywords), suggest which of these categories apply:
- traditional_ai_threats — attacks on ML models: poisoning, extraction, evasion, backdoors
- llm_threats — LLM-specific attacks: prompt injection, jailbreaks, data leakage, guardrail bypass
- agentic_ai_threats — attacks on AI agents and tools: MCP abuse, tool hijacking, excessive agency
- ai_enabled_threats — AI as attack weapon: deepfakes, AI phishing, AI malware

If the source is about AI security governance, policy, or defensive capabilities that do not describe a specific offensive technique, suggest no category_candidate or suggest unclear_or_adjacent.

Consider:
- Is AI the TARGET (traditional, LLM, or agentic threats)?
- Is AI the TOOL (ai_enabled_threats)?
- Does it describe a specific offensive technique or a real attack?

Return strict JSON only — no markdown, no preamble, no explanation outside the JSON.`;
}

// ── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(source, detType) {
  const parts = [
    `TITLE: ${source.title || "(no title)"}`,
    `PUBLISHER: ${source.publisher || "unknown"}`,
    `DATE: ${source.date_published || "unknown"}`,
    `URL: ${source.url || ""}`,
  ];

  if (detType && detType.type !== "unknown") {
    parts.push(
      `PRE-CLASSIFICATION (deterministic hint): source_type=${detType.type} (confidence: ${detType.confidence}, method: ${detType.method})`
    );
  }

  const summary = (source.summary || "").trim();
  if (summary) parts.push(`\nSUMMARY: ${summary.slice(0, 500)}`);

  const text = (source.clean_text || source.full_text || "").trim();
  if (text) parts.push(`\nSOURCE TEXT:\n${text.slice(0, 2500)}`);

  const tags = (source.tags || []).filter(Boolean);
  if (tags.length > 0) parts.push(`\nEXISTING TAGS: ${tags.join(", ")}`);

  return parts.join("\n");
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function guessCategoryFromKeywords(source) {
  const text = `${source.title || ""} ${source.full_text || ""}`.toLowerCase();

  if (
    text.includes("adversarial ml") || text.includes("adversarial machine learning") ||
    text.includes("model extract") || text.includes("data poison") ||
    text.includes("model evasion") || text.includes("evasion attack") ||
    text.includes("backdoor attack") || text.includes("adversarial example") ||
    text.includes("model inversion") || text.includes("membership inference")
  ) return "traditional_ai_threats";

  if (
    text.includes("deepfake") || text.includes("disinformation") ||
    text.includes("synthetic media") || text.includes("voice clone") ||
    text.includes("ai-powered phishing") || text.includes("ai-enabled phishing") ||
    text.includes("ai-generated phishing") || text.includes("ai-assisted phishing")
  ) return "ai_enabled_threats";

  if (
    text.includes("agentic") || text.includes(" mcp ") || text.includes("mcp server") ||
    text.includes("langchain") || text.includes("autogpt") ||
    text.includes("autonomous agent") || text.includes("multi-agent") ||
    text.includes("tool hijack") || text.includes("function hijack") ||
    text.includes("coding agent")
  ) return "agentic_ai_threats";

  if (
    text.includes("prompt injection") || text.includes("jailbreak") ||
    text.includes("rag poison") || text.includes("guardrail") ||
    text.includes("llm vulnerability") || text.includes("large language model")
  ) return "llm_threats";

  return null;
}

function deterministicFallback(source, detType) {
  const guessedCat = guessCategoryFromKeywords(source);
  const candidates = guessedCat
    ? [{
        category:       guessedCat,
        supporting_tags: [],
        confidence:      "low",
        reason:          "Keyword matching fallback — LLM unavailable",
      }]
    : [];

  return {
    source_type:            detType.type,
    source_type_confidence: detType.confidence,
    source_type_reason:     `Deterministic rule (${detType.method}) — LLM unavailable`,
    source_summary:         `${source.title || ""}. Published by ${source.publisher || "unknown"}.`,
    primary_subject:        (source.title || "").slice(0, 80),
    main_claims:            [],
    key_entities:           [source.publisher].filter(Boolean),
    important_numbers:      [],
    framework_tags:         [],
    attack_mappings:        [],
    governance_tags:        [],
    category_candidates:    candidates,
    llm_used:               false,
    taxonomy_version:       TAXONOMY_VERSION,
  };
}

// ── Output validation + normalisation ─────────────────────────────────────────

function validateAndNormalise(raw, detType) {
  const out = { ...raw };

  if (!ALL_SOURCE_TYPES.includes(out.source_type)) {
    out.source_type            = detType?.type || "unknown";
    out.source_type_confidence = detType?.confidence || "low";
    out.source_type_reason     = `LLM returned invalid type — reverted to deterministic (${detType?.method})`;
  }

  out.framework_tags  = validateTags(out.framework_tags || [], 5);
  out.attack_mappings = validateAttackMappings(out.attack_mappings || [], 5);
  out.governance_tags = validateGovernanceTags(out.governance_tags || [], 3);

  // Groq (JSON mode) may return category_candidates as string[] instead of {category,confidence}[]
  let rawCandidates = out.category_candidates;
  if (typeof rawCandidates === "string") rawCandidates = [];  // unparseable — drop
  if (!Array.isArray(rawCandidates)) rawCandidates = [];
  out.category_candidates = rawCandidates
    .map((c) => typeof c === "string" ? { category: c, confidence: "medium" } : c)
    .filter((c) => c && typeof c === "object" && CLASSIFIABLE_CATEGORIES.includes(c.category))
    .slice(0, 3);

  out.main_claims       = (out.main_claims       || []).slice(0, 5);
  out.key_entities      = (out.key_entities      || []).slice(0, 10);
  out.important_numbers = (out.important_numbers || []).slice(0, 5);

  if ((out.source_summary || "").length > 600) {
    out.source_summary = out.source_summary.slice(0, 600) + "…";
  }

  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

let _systemPromptCache = null;

/**
 * Enrich a single source with taxonomy tags and intelligence metadata.
 *
 * @param {object} source - A cleaned source from Layer 4.
 * @param {object} [opts]
 * @param {boolean} [opts.skipLlm=false] - Force deterministic fallback.
 * @returns {Promise<object>} Source with `understanding` and `taxonomy_version` set.
 */
export async function understandSource(source, opts = {}) {
  const { skipLlm = false } = opts;

  if (source.taxonomy_version === TAXONOMY_VERSION) return source;

  const detType = classifySourceType(source);

  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  let taxonomy;

  if (!hasLlm) {
    taxonomy = deterministicFallback(source, detType);
  } else {
    // Build system prompt once and cache — it includes the taxonomy registry
    // which is static, so generating it per call is wasteful.
    if (!_systemPromptCache) _systemPromptCache = buildSystemPrompt();

    try {
      const userPrompt = buildUserPrompt(source, detType);
      const raw = await callLLM(_systemPromptCache, userPrompt, {
        schema:   TAXONOMY_SCHEMA,
        logLabel: "Layer5-taxonomy",
      });
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      taxonomy = {
        ...validateAndNormalise(parsed, detType),
        llm_used:        true,
        taxonomy_version: TAXONOMY_VERSION,
      };
    } catch (err) {
      process.stdout.write(
        `  [Layer 5] LLM failed for "${(source.title || "").slice(0, 60)}": ${err.message} — using fallback\n`
      );
      taxonomy = deterministicFallback(source, detType);
    }
  }

  const newSourceType = taxonomy.source_type || source.source_type;

  // Preserve existing valid source_type if the fallback would degrade it
  const resolvedSourceType = (
    !taxonomy.llm_used && source.source_type && source.source_type !== "unknown"
  ) ? source.source_type : newSourceType;

  return {
    ...source,
    source_type:      resolvedSourceType,
    taxonomy_version: TAXONOMY_VERSION,
    // Keep `understanding` as the runtime field name for downstream compat.
    // NOTE: main_category is NOT set here — Layer 6 (classifyCategory) sets it.
    understanding: {
      ...taxonomy,
      source_type: resolvedSourceType,
    },
  };
}
