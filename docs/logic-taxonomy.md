# Taxonomy Logic

## What it does

The taxonomy layer assigns each source its **tags** and **AI specificity score**. These are the primary classification signals — tags describe which specific AI threat techniques are present, and the score measures how central AI threats are to the source.

All taxonomy decisions are made by the LLM enrichment step (`lib/claims/enrichSource.js`). There is no rule-based fallback — if no LLM keys are available, sources remain unclassified until a key is configured.

---

## LLM usage in this layer

| Step | File | Purpose | API keys |
|---|---|---|---|
| Tag assignment + AI specificity score | `lib/claims/enrichSource.js` | Identify AI threat techniques in the source text | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |

**Provider rotation order** (first provider with a valid key is tried first):

1. OpenAI — `gpt-4o-mini` (via `OPENAI_API_KEY`)
2. OpenAI-2 — `gpt-4o-mini` (via `OPENAI_API_KEY_2`, secondary key)
3. Groq — `llama-3.3-70b-versatile` (via `GROQ_API_KEY`, free tier, OpenAI-compatible)
4. Gemini Flash — `gemini-2.0-flash` (via `GEMINI_API_KEY`, higher quota than 2.5)
5. Gemini 2.5 — `gemini-2.5-flash` (via `GEMINI_API_KEY`, final fallback)
6. Gemini Flash-2 — `gemini-2.0-flash` (via `GEMINI_API_KEY_2`, secondary key)
7. Gemini 2.5-2 — `gemini-2.5-flash` (via `GEMINI_API_KEY_2`, last resort)

Quota-exhausted providers (HTTP 429 with `insufficient_quota` / `RESOURCE_EXHAUSTED`) are skipped and the next provider is tried. Rate-limited providers (HTTP 429 with `rate_limit`) wait the `retry-after` duration (up to 30s) and retry the same provider up to 3 times before moving on. Non-quota errors (auth failure, network error) bail immediately. If all providers are exhausted, the call throws and the source remains unclassified.

**Source text** is trimmed to 12,000 characters before sending. The prompt also passes the source's existing tags (from initial phrase-based tagging) as hints; the LLM may adopt, extend, or override them.

**`main_category` is NOT assigned by the LLM.** It is derived deterministically from the tags in the classification layer (`lib/classification/deriveCategory.js`).

---

## Main categories

Four mutually exclusive threat domains. Sources must be assigned to exactly one, or left as `uncategorised` if the content does not clearly fit.

| Category | Definition | Framework source |
|---|---|---|
| `traditional_ai_threats` | Attacks **on** ML models, training pipelines, and datasets | MITRE ATLAS |
| `llm_threats` | Attacks **on** or **via** large language models | OWASP LLM Top 10 (2025) |
| `agentic_ai_threats` | Attacks **on** or **via** autonomous AI agents, tool use, and orchestration systems | OWASP Agentic AI (2025) |
| `ai_enabled_threats` | AI used **as a weapon** by threat actors against human or system targets | MITRE ATT&CK |

**Key distinctions:**

- `traditional_ai_threats` covers classical ML attacks: evasion, data poisoning, model extraction, inversion, backdoors, and ML supply chain compromise. It does NOT cover LLM-specific attacks even if the target is a neural network.
- `llm_threats` covers the OWASP LLM Top 10 (2025) taxonomy. If an LLM is the primary target or attack surface, this is the right category.
- `agentic_ai_threats` covers cases where an autonomous agent is the attack surface or attack vector. MCP exploitation, agent goal hijacking, coding agent vulnerabilities, and multi-agent pipeline attacks fall here.
- `ai_enabled_threats` covers cases where AI generates or amplifies the attack: deepfakes, AI-written malware, AI phishing campaigns, disinformation operations. The target is typically a human or non-AI system.

**Why `ai_for_security` was removed:** Defensive AI use cases (SOC automation, AI-assisted threat hunting, AI vulnerability scanners) are context, not threat intelligence. Including them as a threat category mixed attack and defence content, degraded report signal quality, and inflated source counts for non-threat material. Defensive sources are now classified as `uncategorised` and filtered out by the `ai_specificity_score < 10` purge gate.

---

## Tags

Tags are additive signals within a category. A source may have multiple tags. All tags must come from the controlled vocabulary in `lib/classification/allowedTags.js`.

### Traditional AI / ML threat tags (MITRE ATLAS)

| Tag | Definition | Framework |
|---|---|---|
| `adversarial_examples` | Crafted inputs that cause model misclassification | ATLAS AML.T0015 |
| `data_poisoning` | Contaminating training datasets to corrupt model behaviour | ATLAS AML.T0020 |
| `model_backdoor` | Hidden triggers embedded in trained weights | ATLAS AML.T0018 |
| `model_extraction` | Stealing model behaviour via systematic API queries | ATLAS AML.T0037 |
| `model_inversion` | Inferring training data from model outputs | ATLAS AML.T0024 |
| `ml_supply_chain` | Malicious pretrained models, Hugging Face attacks, unsafe deserialization | ATLAS AML.T0010 |

### LLM threat tags (OWASP LLM Top 10, 2025)

| Tag | Definition | Framework |
|---|---|---|
| `prompt_injection` | Direct and indirect instruction injection attacks | OWASP LLM01 |
| `insecure_output_handling` | Downstream code/command injection via unsanitised LLM output | OWASP LLM02 |
| `training_data_poisoning` | Corrupting LLM training or fine-tuning data | OWASP LLM03 |
| `model_dos` | Resource exhaustion via crafted inputs (sponge attacks) | OWASP LLM04 |
| `llm_supply_chain` | Vulnerable plugins, training data sources, pretrained components | OWASP LLM05 |
| `sensitive_data_disclosure` | System prompt extraction, PII leakage, memorisation attacks | OWASP LLM06 |
| `insecure_plugin_design` | Inadequate access controls on LLM plugins and tools | OWASP LLM07 |
| `excessive_agency` | LLM granted excessive permissions or autonomy beyond task scope | OWASP LLM08 |
| `overreliance` | Unsafe reliance on LLM output; guardrail bypass via misplaced trust | OWASP LLM09 |
| `model_theft` | Model stealing and fine-tuned model exfiltration | OWASP LLM10 |
| `jailbreak` | Circumventing LLM safety training (DAN, roleplay, many-shot attacks) | OWASP LLM01/LLM09 |
| `rag_attack` | RAG / vector database poisoning; context manipulation via retrieval | OWASP LLM03/LLM06 |

### Agentic AI threat tags (OWASP Agentic AI + MITRE ATLAS)

| Tag | Definition | Framework |
|---|---|---|
| `agent_hijacking` | Manipulation of an agent's goals, tasks, or execution context | OWASP Agentic AI |
| `mcp_exploitation` | Model Context Protocol server compromise; tool poisoning via MCP | OWASP Agentic AI |
| `tool_abuse` | Unauthorised or manipulated tool/function calls by an LLM agent | OWASP LLM08 |
| `agent_memory_attack` | Persistent memory or context poisoning across agent sessions | OWASP Agentic AI |
| `coding_agent_risk` | Security flaws in or via AI coding assistants (Copilot, Cursor, Claude Code) | OWASP Agentic AI |
| `multi_agent_attack` | Attacks spanning or exploiting multi-agent pipelines | OWASP Agentic AI |
| `browser_agent_risk` | Exploitation of computer-use and web-browsing agent capabilities | OWASP Agentic AI |

### AI-enabled threat tags (MITRE ATT&CK + CTI)

| Tag | Definition | Framework |
|---|---|---|
| `ai_generated_phishing` | LLM-crafted spear-phishing at scale | ATT&CK T1566 |
| `deepfake` | Synthetic video/image for fraud, impersonation, or social engineering | ATT&CK T1598 |
| `voice_cloning` | AI voice synthesis for fraud, BEC, and vishing | ATT&CK T1566 |
| `synthetic_identity` | AI-generated personas, documents, or identities for fraud | ATT&CK T1585 |
| `ai_generated_malware` | LLM-written, obfuscated, or polymorphic malware | ATT&CK T1588 |
| `ai_disinformation` | AI-powered influence operations and synthetic narratives | ATT&CK T1583 |
| `ai_reconnaissance` | AI-assisted OSINT, target profiling, and vulnerability discovery | ATT&CK T1595 |

### Operational context tags (cross-cutting)

These tags carry no category signal — they appear alongside threat tags from any category.

| Tag | Definition |
|---|---|
| `cve` | References a specific CVE identifier |
| `actively_exploited` | In-the-wild exploitation confirmed by a trusted source |
| `proof_of_concept` | Publicly available PoC exploit or research demonstration |
| `vulnerability` | Vulnerability disclosure (with or without CVE) |
| `supply_chain` | Software or hardware supply chain attack vector |
| `critical_infrastructure` | Attack targets critical infrastructure sectors |
| `nation_state` | Attributed to or characteristic of a nation-state threat actor |
| `research` | Academic or peer-reviewed research paper |

---

## Pre-classification initial tagging

Before full LLM classification runs, `lib/sources/tagSource.js` applies a lightweight phrase-based scan at ingestion time. This produces rough initial tags stored with the source.

Initial tags are:
- Used as hints to the LLM prompt (the LLM sees existing tags alongside source text)
- Overwritten entirely by LLM classification — they are never the final classification
- Intentionally conservative: only assigned on highly unambiguous phrases

The QUICK_RULES cover the most distinctive threat phrases (e.g., "model context protocol", "jailbreaking", "voice cloning") and all context tags (cve, research, supply_chain). Ambiguous cases are left for the LLM.

---

## Purge pre-filter

Before LLM classification runs, `lib/classification/purgeIrrelevantSources.js` removes sources with no AI signal:

- **Pass 1**: Sources already classified with `ai_specificity_score < 10` are deleted.
- **Pass 2**: Unclassified sources are checked against a broad AI keyword list (e.g., "artificial intelligence", "llm", "jailbreak", "deepfake"). Sources with zero keyword matches are deleted as off-topic. Any match is sufficient to pass — precise scoring happens at the LLM step.

Curated sources (trust_tier = "curated" OR tags includes "curated") are never purged regardless of score.

---

## Tag validation

`lib/classification/allowedTags.js` exports `ALLOWED_TAGS` and `isAllowedTag()`. The LLM prompt passes the full `ALLOWED_TAGS` array. After the LLM response is parsed, any tag not in `ALLOWED_TAGS` is silently dropped before the source is stored.

The tag vocabulary is versioned (`TAG_VERSION = "ai-threat-tags-v5.0"` in `tagDefinitions.js`) and stored as `tag_version` on each source, allowing queries to filter by taxonomy generation.
