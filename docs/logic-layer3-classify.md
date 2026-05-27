# Layer 3 — Classify

**File:** `lib/pipeline/classify/validateAndTypeSource.js`
**No LLM calls** in the current implementation (Layer 3.3 `classifyDataType` has an LLM path but it is disabled in practice; source typing is done rule-based).

---

## Purpose

Decide which sources are structurally usable, AI-cyber relevant, and trustworthy enough to proceed to Layer 4. Every source is returned with a `layer3_status`; no source is silently dropped.

---

## Sublayer Flow

```
source
    │
    ▼
3.1  checkSourceValidity      — is it structurally usable?
    │
    ▼
3.2  assessAiRelevance        — is it AI-cyber relevant?
    │
    ▼
3.3  classifyDataType         — what kind of source is it?
    │
    ▼
3.4  assessTrustAndCredibility — how trustworthy is it?
    │
    ▼
3.5  applyFinalGate           — pass | review | reject
```

Each sublayer runs in sequence. Layer 3.3 is skipped for hard-failed sources (saves tokens).

---

## 3.1 — Source Validity (`sourceValidity.js`)

Checks whether the source is structurally usable. Produces:
- `is_valid` — boolean
- `validity_reason` — human-readable explanation
- `filter_flags[]` — list of triggered flags
- `text_quality_score` (0–100)
- `publish_date_confidence` — exact | estimated | low | none

**Hard-fail flags** (set `is_valid = false`):
- `no_url` — missing URL
- `excluded_publisher` — publisher on blocklist
- `duplicate_url` — canonical URL seen before in this run

**Soft flags** (source passes but is flagged for review):
- `missing_publisher`
- `possible_non_english`
- `date_before_2020`
- `minimal_text` — clean_text < 200 chars
- `no_publish_date`

---

## 3.2 — AI Relevance (`aiRelevance.js`)

Rule-based relevance scoring. Produces:
- `ai_relevance_score` (0–100)
- `cyber_relevance_score` (0–100)
- `ai_specificity_score` (0–100) — combined AI-cyber centrality
- `relevance_tier` — core | adjacent | peripheral | off_topic

**Scoring formula:**

```
ai_relevance_score:
  high signals  (×14, max 5):  prompt injection, jailbreak, llm, gpt, adversarial,
                                data poisoning, model extraction, deepfake, mcp,
                                agentic, voice cloning, rag poisoning, ...
  medium signals (×8, max 3):  artificial intelligence, generative ai, llm application,
                                foundation model, machine learning, ai governance, ...
  low signals   (×3, max 2):   ai, automation, algorithm, intelligent system, ...
  max: 70 + 24 + 6 = 100

cyber_relevance_score: same formula with different signal dictionaries
  (vulnerability, cve, exploit, malware, threat actor, zero-day, ...)

ai_specificity_score = min(100, ai_relevance_score + min(15, cyber_score × 0.15))
```

**Relevance tiers:**
| Score | Tier |
|-------|------|
| ≥ 40 | core |
| ≥ 20 | adjacent |
| ≥ 10 | peripheral |
| < 10 | off_topic |

Note: LLM-refined `ai_specificity_score` from Layer 4 (understandSource) may override this value.

---

## 3.3 — Data Typing (`dataTyping.js`)

Assigns `source_type` from the controlled vocabulary. Primarily rule-based using URL patterns, publisher domain, and content signals.

Source types (controlled vocabulary):
`vulnerability` | `exploit_disclosure` | `incident` | `threat_intelligence` |
`research_finding` | `defensive_capability` | `benchmark_evaluation` |
`capability_demonstration` | `adversary_adoption_signal` |
`infrastructure_dependency_signal` | `trust_boundary_shift` |
`societal_harm_signal` | `governance_signal` | `ecosystem_signal` |
`strategic_signal` | `unknown`

Output:
- `source_type` — assigned type
- `source_type_confidence` — high | medium | low
- `source_type_reason` — brief explanation

---

## 3.4 — Trust Assessment (`trustAssessment.js`)

Assigns `trust_tier` based on publisher domain and known source registry.

| Tier | Examples |
|------|---------|
| `primary` | CISA, NCSC, CSA, NIST, Anthropic, OpenAI, ENISA |
| `high` | Microsoft Security, Google Security, Unit 42, CrowdStrike, academic publishers |
| `medium` | General security news (The Hacker News, BleepingComputer, DarkReading) |
| `curated` | Manually imported sources — never rejected or deleted |
| `low` | Unknown low-signal blogs |
| `unknown` | Publisher not in registry |
| `exclude` | Blocklisted domains |

Output:
- `trust_tier`
- `source_credibility_score` (0–100)
- `credibility_reason`

---

## 3.5 — Final Gate (`finalGate.js`)

Combines 3.1–3.4 into a single routing decision.

**Hard reject** (→ `layer3_status: reject`, `downstream_route: discard`):
- `is_valid = false` (failed 3.1)
- `trust_tier = "exclude"` (blocklisted)
- `relevance_tier = "off_topic"` AND trust tier is not primary/high

**Review** (→ `layer3_status: review`, `downstream_route: layer4_with_review`):
- `relevance_tier = "off_topic"` BUT `trust_tier ∈ {primary, high}` — rule-based scoring may have missed relevance
- Any soft flag from 3.1 is present (missing_publisher, possible_non_english, date_before_2020, minimal_text, no_publish_date)
- `source_type = "unknown"`

**Pass** (→ `layer3_status: pass`, `downstream_route: layer4`):
- All other sources

---

## Output Fields Per Source

| Field | Type | Set by |
|-------|------|--------|
| `is_valid` | boolean | 3.1 |
| `validity_reason` | string | 3.1 |
| `filter_flags` | string[] | 3.1 |
| `text_quality_score` | number | 3.1 |
| `publish_date_confidence` | string | 3.1 |
| `ai_relevance_score` | number | 3.2 |
| `cyber_relevance_score` | number | 3.2 |
| `ai_specificity_score` | number | 3.2 |
| `relevance_tier` | string | 3.2 |
| `source_type` | string | 3.3 |
| `source_type_confidence` | string | 3.3 |
| `trust_tier` | string | 3.4 |
| `source_credibility_score` | number | 3.4 |
| `layer3_status` | pass\|review\|reject | 3.5 |
| `downstream_route` | string | 3.5 |

---

## Batch Processing

`validateAndTypeSources(sources, opts)` runs all sublayers per source sequentially (200ms delay between LLM calls in 3.3 if enabled). Returns:
```js
{ sources, passing, rejected, stats: { total, pass_count, review_count, reject_count, llm_calls, flag_frequency } }
```
