# Layer 4 — Understand

**File:** `lib/pipeline/understand/understandSource.js`
**LLM call:** Yes — one call per source (with deterministic fallback).

---

## Purpose

Enrich every Layer-3-passing source with deep taxonomy intelligence: source type (confirmed), framework tags, analyst summary, key claims, entities, and category candidates. This is the primary LLM enrichment step — every downstream layer uses `source.understanding`.

---

## LLM Call

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |
| Model priority | gpt-4o-mini → gpt-4o-mini(2) → llama-3.3-70b → gemini-2.0-flash → gemini-2.5-flash → ... |
| Groq note | Supported but degrades to JSON mode (no `json_schema`) |
| Output format | Structured JSON via `TAXONOMY_SCHEMA` |
| Label | `"Layer5-taxonomy"` |
| Trigger | Any API key present AND `skipLlm=false` |
| Idempotency | Sources already stamped with `TAXONOMY_VERSION` are skipped |
| Fallback | `deterministicFallback()` — rule-based source_type + keyword category matching |

---

## System Prompt

```
You are enriching a source for an AI-cyber horizon scan.

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

## STEP 3 — ASSIGN FRAMEWORK TAGS

Rules — these are MANDATORY:
1. Do not tag based only on keyword appearance.
2. Tag only if the source substantively discusses the risk, technique, vulnerability, or governance issue.
3. Each tag must include evidence: one sentence explaining why it applies to THIS source.
4. If a term is mentioned only in passing or as background, do not tag it.
5. Infer carefully from system names: MCP, LangChain, LangGraph, CrewAI, Semantic Kernel, OpenAI Agents SDK, Claude Code, AutoGPT, ChatGPT, Gemini, Copilot, Hugging Face.
6. Do not over-tag. Quality over quantity. Max 5 tags per source.
7. Return empty array if no controlled tag clearly applies.
8. You MUST use only tags from the allowed registry above. Do not invent tags.

## STEP 4 — SUGGEST CATEGORY CANDIDATES

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

Return strict JSON only — no markdown, no preamble, no explanation outside the JSON.
```

Note: `${taxonomyContext}` is replaced at runtime with the full controlled registry from `lib/pipeline/classify/taxonomyRegistry.js`.

---

## User Prompt

Built by `buildUserPrompt(source, detType)`:

```
TITLE: <source.title>
PUBLISHER: <source.publisher>
DATE: <source.date_published>
URL: <source.url>
PRE-CLASSIFICATION (deterministic hint): source_type=<detType.type> (confidence: <detType.confidence>, method: <detType.method>)

SUMMARY: <source.summary, first 500 chars>

SOURCE TEXT:
<source.clean_text or source.full_text, first 2500 chars>

EXISTING TAGS: <source.tags joined by ", ">
```

The pre-classification hint is included only when `detType.type !== "unknown"`. It tells the LLM what the rule-based classifier already determined — the LLM can override it.

---

## Output Schema (`TAXONOMY_SCHEMA`)

```json
{
  "source_type": "string (one of 16 controlled values)",
  "source_type_confidence": "high | medium | low",
  "source_type_reason": "string",
  "source_summary": "string (2-3 sentences)",
  "primary_subject": "string (≤15 words)",
  "main_claims": ["string", "..."],
  "key_entities": ["string", "..."],
  "important_numbers": ["string", "..."],
  "framework_tags": [
    {
      "tag": "string (controlled registry ID)",
      "framework": "OWASP | MITRE_ATLAS | MITRE_ATTACK | NIST_AI_RMF | INTERNAL",
      "evidence": "string (one sentence)"
    }
  ],
  "category_candidates": ["traditional_ai_threats | llm_threats | agentic_ai_threats | ai_enabled_threats | unclear_or_adjacent"]
}
```

---

## Deterministic Fallback

When `skipLlm=true` or no API keys are set:

```js
deterministicFallback(source, detType) {
  source_type = detType.type or classifySourceType(source)
  source_summary = source.summary.slice(0, 300) or title
  main_claims = []
  key_entities = []
  important_numbers = []
  framework_tags = []
  category_candidates = [keyword-matched categories]
  llm_used = false
}
```

---

## Output Fields Added to Source

| Field | Set by |
|-------|--------|
| `source.source_type` | Layer 4 (overrides Layer 3 typing) |
| `source.taxonomy_version` | idempotency stamp |
| `source.understanding.source_summary` | LLM |
| `source.understanding.primary_subject` | LLM |
| `source.understanding.main_claims` | LLM |
| `source.understanding.key_entities` | LLM |
| `source.understanding.important_numbers` | LLM |
| `source.understanding.framework_tags` | LLM |
| `source.understanding.category_candidates` | LLM |
| `source.understanding.llm_used` | boolean |

`main_category` is NOT set here — Layer 6 (`classifyCategory.js`) picks the winner from `category_candidates`.

---

## Batch Processing (`understandSources.js`)

Runs `understandSource()` on all sources with bounded concurrency (default 5). Returns sources with `understanding` field set. Sources that already have `taxonomy_version` stamped are passed through unchanged.
