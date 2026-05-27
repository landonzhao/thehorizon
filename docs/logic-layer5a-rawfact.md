# Layer 5a — Rawfact Branch

**Orchestrator:** `lib/pipeline/rawfact/runRawfactBranch.js`
**LLM calls:** Steps 1 and 2. Steps 3–5 are fully deterministic.

---

## Purpose

Transform Layer-4-enriched sources into prioritised, clustered evidence items ready for the analysis layer. Each source emerges with rawfact taxonomy metadata, an optional evidence card, a numeric score, a priority band, and a cluster assignment.

---

## Pipeline Steps

```
sources[]
    │
    ▼
Step 1 (7.1A): applyRawfactTaxonomies   — LLM or deterministic
    │
    ▼
Step 2 (7.1B): extractRawfacts          — LLM evidence cards (high-priority only)
    │
    ▼
Step 3 (7.1C): scoreRawfacts            — initial scoring, no duplicate penalty
    │
    ▼
Step 4 (7.1D): clusterRawfacts          — Jaccard clustering within categories
    │
    ▼
Step 5 (7.1C): scoreRawfacts            — re-score, apply -10 duplicate penalty
    │
    ▼
rawfact_sources[]
```

Steps 3 and 5 call the same `scoreRawfacts()` function. The second call applies a `-10` duplicate penalty to non-representative cluster members.

---

## Step 1 — Rawfact Taxonomy (7.1A)

**File:** `lib/pipeline/rawfact/rawfactTaxonomy.js`
**LLM call:** Yes — one call per source (with deterministic fallback).

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | Any OPENAI/GROQ/GEMINI key |
| Output format | Structured JSON via schema |
| Label | `"Layer7.1A-taxonomy-<source_id>"` |
| Concurrency | 5 parallel calls |
| Trigger | Any API key AND `skipLlm=false` |

### System Prompt

```
You are preparing a source for factual evidence extraction in an AI-cyber horizon scan.

This is NOT strategic analysis. This is evidence preparation.

The source already has Layer 5 intelligence: source_type, main_category, framework_tags,
source_summary, primary_subject, main_claims, key_entities, important_numbers.

Your task: assign rawfact taxonomy fields that describe what kind of factual evidence
this source contains.

Be source-type-aware:
- vulnerability: focus on exploitability, affected ecosystem, blast radius, patch status, exploitation status
- exploit_disclosure: focus on exploit chain, reproducibility, access required, public tooling, operational realism
- incident: focus on confirmed impact, victim/sector, scale, attacker method, repeatability, institutional response
- threat_intelligence: focus on observed TTPs, actor/campaign details, sectors, operational confidence
- research_finding: focus on demonstrated method, reproducibility, systems tested, research-to-threat potential
- defensive_capability: focus on gap addressed, capability proposed, deployment readiness, limitations
- governance_signal: focus on issuing authority, governance issue, affected sectors, compliance implications
- ecosystem_signal: focus on adoption/infrastructure shifts and downstream security impact
- societal_harm_signal: focus on harm type, affected population, trust system, institutional response
- benchmark_evaluation: focus on capability measured, key result, trajectory signal
- capability_demonstration: focus on demonstrated capability, affected system, ease of replication, defender implications
- adversary_adoption_signal: focus on who is adopting, what capability, observed evidence, spread trajectory
- infrastructure_dependency_signal: focus on dependency type, attack surface created, scope of exposure
- trust_boundary_shift: focus on trust assumption violated, affected context, systemic implication
- strategic_signal: focus on strategic theme, systemic risk, convergence signal

Enums:
impact_scope: individual | organization | sector | ecosystem | societal | global | unknown
impact_severity: critical | high | medium | low | informational | unknown
operational_relevance: very_high | high | medium | low | none
novelty: new_attack_surface | new_tactic | known_tactic_new_scale | known_tactic | incremental | unknown

Rules:
- Do not invent facts not in the source.
- Do not write strategic insights.
- Use "unknown" when the source does not provide enough detail.
- Return strict JSON only — no markdown, no preamble.
```

### User Prompt

Built by `buildUserPrompt(source)`:

```
SOURCE TYPE: <source.source_type>
MAIN CATEGORY: <source.main_category>
FRAMEWORK TAGS: <framework tag names, comma-separated>

SUMMARY: <source.understanding.source_summary>
PRIMARY SUBJECT: <source.understanding.primary_subject>
MAIN CLAIMS:
1. <claim>
2. <claim>
...
KEY ENTITIES: <entities, comma-separated>
IMPORTANT NUMBERS: <numbers, pipe-separated>

SOURCE TEXT (excerpt):
<source.clean_text, first 1500 chars>
```

### Output Fields (`rawfact_taxonomy`)

```json
{
  "operational_relevance": "very_high | high | medium | low | none",
  "novelty": "new_attack_surface | new_tactic | known_tactic_new_scale | known_tactic | incremental | unknown",
  "impact_severity": "critical | high | medium | low | informational | unknown",
  "impact_scope": "individual | organization | sector | ecosystem | societal | global | unknown",
  "sector": ["string"],
  "technology": ["string"],
  "source_type_context": { ... },
  "rawfact_taxonomy_version": "string"
}
```

### Deterministic Fallback

When `skipLlm=true` or no keys are set: rule-based mapping from `source_type` + `trust_tier` + `ai_specificity_score`. Sets `operational_relevance` from trust tier and `novelty` from source type.

---

## Step 2 — Evidence Card Extraction (7.1B)

**File:** `lib/pipeline/rawfact/extractRawfacts.js`
**LLM call:** Yes — only for high-priority sources.

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | Any OPENAI/GROQ/GEMINI key |
| Output format | Structured JSON via schema |
| Label | `"Layer7.1B-evidence-<source_id>"` |
| Concurrency | 5 parallel calls |
| Trigger condition | `operational_relevance ∈ {very_high, high}` OR `feed_priority ∈ {must_read, high}` |
| Fallback | `null` evidence_card (source skipped, not failed) |

### System Prompt

```
You are a senior intelligence analyst extracting structured evidence from a cybersecurity source for use in a strategic AI threat briefing deck.

Your output will be placed directly on presentation slides. Precision and brevity are critical — no filler phrases.

RAWFACT TAXONOMY is provided — use it to focus extraction on the most important evidence type for this source's source_type.

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

## SOURCE-TYPE GUIDANCE (use rawfact_taxonomy to focus)
- vulnerability/exploit_disclosure: prioritise attack_flow, affected systems, exploit status
- incident: prioritise confirmed impacts, victim details, attacker method
- threat_intelligence: prioritise observed TTPs, threat actor, targeted sectors
- research_finding: prioritise method demonstrated, systems tested, key result
- defensive_capability: prioritise gap addressed, deployment readiness, limitations
- governance_signal: prioritise issuing authority, compliance implications, recommended actions
- benchmark_evaluation: prioritise capability measured, key result, trajectory
- capability_demonstration: prioritise demonstrated capability, affected system, replication difficulty
- adversary_adoption_signal: prioritise who is adopting, evidence quality, affected sectors
- strategic_signal: prioritise strategic theme, systemic risk, horizon relevance

## RULES
- Return strict JSON only — no markdown, no explanation
- Do not invent facts not in the source
- If a field is not applicable, use an empty array or a neutral statement
```

### User Prompt

Built by `buildUserPrompt(source)`:

```
TITLE: <source.title>
PUBLISHER: <source.publisher>  DATE: <source.date_published>  URL: <source.url>
CATEGORY: <source.main_category>  SOURCE TYPE: <source.source_type>
RAWFACT TAXONOMY:
  operational_relevance: <value>
  novelty: <value>
  impact_severity: <value>
  impact_scope: <value>
  sector: <comma-separated>

ANALYST SUMMARY: <source.understanding.source_summary>

SOURCE TEXT:
<source.clean_text, first 1800 chars>
```

### Output Fields (`evidence_card`)

```json
{
  "evidence_card_title": "string (≤10 words)",
  "short_summary": "string (1-2 sentences)",
  "key_facts": ["string"],
  "numbers_statistics": ["value: context"],
  "attack_flow": ["verb phrase"],
  "impacts": ["string"],
  "why_it_matters": "string (1 sentence)",
  "best_used_for": ["trend_support | case_study | outlook_support | visual_annotation | stat_callout"]
}
```

---

## Step 3 & 5 — Scoring (7.1C)

**File:** `lib/pipeline/rawfact/scoreRawfacts.js`
**No LLM calls.** Fully deterministic.

### Score Formula

```
rawfact_score = common_base(0–40) + type_specific(0–45) + horizon_bonus(0–15) - penalties
```

**common_base (0–40):**
- `source_credibility` (0–10): primary=10, curated=9, high=8, medium=6, low=3, unknown=1
- `ai_relevance` (0–10): from ai_specificity_score, boosted if has offensive category + high classification_confidence
- `evidence_concreteness` (0–10): key_facts × 2 + hasNumbers ? 2 : 0 + hasAttackFlow ? 2 : 0, max 10
- `citation_quality` (0–5): primary/curated=5, high=4, has URL=2, else=0
- `recency` (0–5): ≤30 days=5, ≤90=3, ≤180=2, ≤365=1, older=0

**type_specific (0–45):** 15 scorers — one per source_type. Each weights different rawfact_taxonomy fields:
- `threat_intel_report`, `academic_paper`, `vendor_security_blog`, `news_article`, `government_advisory`, `conference_talk`, `technical_writeup`, `vulnerability_db`, `tool_or_project`, `standard_or_framework`, `podcast_or_video`, `newsletter`, `social_media`, `forum_discussion`, `unknown`

**horizon_bonus (0–15):** bonus for AI-specific attack chains, multi-vector attacks, novel techniques, or high ai_specificity_score (≥80).

**duplicate_penalty:** -10 applied only in Pass 2 when `rawfact_cluster.is_representative === false` AND `cluster_size > 1`.

### Priority Bands

| Band | Score |
|------|-------|
| `must_read` | ≥ 85 |
| `high` | 70–84 |
| `medium` | 50–69 |
| `low` | 30–49 |
| `archive_only` | < 30 |

### Output Fields (`rawfact_score_data`)

```json
{
  "rawfact_score": 0-100,
  "rawfact_priority": "must_read | high | medium | low | archive_only",
  "common_base": { "source_credibility", "ai_relevance", "evidence_concreteness", "citation_quality", "recency", "total" },
  "type_specific": number,
  "horizon_bonus": number,
  "duplicate_penalty": number
}
```

Also mirrored as `feed_score_data` for backward compatibility.

---

## Step 4 — Clustering (7.1D)

**File:** `lib/pipeline/rawfact/clusterRawfacts.js`
**No LLM calls.** Fully deterministic.

### Algorithm

1. Tokenise each title: lowercase, strip punctuation, split on whitespace.
2. Filter: word length > 3 AND not in 34-word STOP_WORDS list.
3. Compute pairwise Jaccard similarity for all source pairs **within the same `main_category`** (cross-category pairs are never clustered).
4. **Threshold:** `SIMILARITY_THRESHOLD = 0.35` — pairs above this are linked.
5. Union-find merges transitively connected pairs into clusters.
6. **Representative:** cluster member with highest `rawfact_score_data.rawfact_score` (falls back to `feed_score_data.feed_score`). Marked `is_representative=true`; all others `false`.
7. `cluster_theme` = representative source's `main_category` + title excerpt.

### Output Fields (`rawfact_cluster`)

```json
{
  "cluster_id": "string",
  "cluster_size": number,
  "representative_title": "string",
  "is_multi_source": boolean,
  "is_representative": boolean,
  "cluster_theme": "string"
}
```

Single-source clusters: `cluster_size=1`, `is_representative=true`.

---

## Branch Output

```js
{
  rawfact_sources: object[],   // all sources with rawfact fields set
  counts: {
    total, taxonomy_done, evidence_cards,
    must_read, high, medium, low, archive_only,
    clusters, multi_source_clusters,
  },
  rawfact_version: "rawfact-v1.0",
}
```
