# Category Classification

**File:** `lib/pipeline/classify/classifyCategory.js`
**No LLM calls.** Fully deterministic.

Runs AFTER Layer 4 (understand) and BEFORE Layer 5a/5b branches.

---

## Purpose

Pick exactly one `main_category` for each source, using the `category_candidates` array produced by the Layer 4 LLM call. This is intentionally deterministic — the LLM already did the interpretive work; this step just picks the winner from its output.

---

## Position in Pipeline

```
Layer 4 (understand)
  → source.understanding.category_candidates[]
  → source.understanding.framework_tags[]
        │
        ▼
  Category Classification   ← THIS STEP
  → source.main_category
  → source.classification_confidence
        │
        ▼
Layer 5a (rawfact branch)   — groups sources by main_category for clustering
Layer 5b (analytics branch) — aggregates counts per main_category
```

`main_category` is the primary grouping key for all downstream layers. Rawfact clustering (7.1D) is within-category. Analytics aggregation (7.2B) counts by category. Dossier builder (8A) selects evidence per category.

---

## Categories

Defined in `lib/config/categories.js`:

| Category | Description |
|----------|-------------|
| `traditional_ai_threats` | Attacks on ML models: poisoning, extraction, evasion, backdoors |
| `llm_threats` | LLM-specific attacks: prompt injection, jailbreaks, guardrail bypass |
| `agentic_ai_threats` | Agent and tool attacks: MCP abuse, tool hijacking, excessive agency |
| `ai_enabled_threats` | AI as weapon: deepfakes, AI phishing, AI malware |
| `unclear_or_adjacent` | Fallback — does not proceed to analysis layer |

---

## Decision Logic

Priority order (highest to lowest):

**1. `category_candidates` from LLM (Layer 4)**

```
category_candidates: [
  { category: "llm_threats", confidence: "high", supporting_tags: [...] },
  { category: "agentic_ai_threats", confidence: "medium", ... }
]
```

Sort by: confidence tier (high > medium > low), then count of `supporting_tags`. Pick the first after sorting.

**2. `framework_tags` fallback (if candidates empty or all low-confidence)**

Count how many framework_tags have a `category_candidate` field matching a known category. Sort by count, then highest tag confidence. If the framework-tag pick has higher confidence than the candidates pick, use it.

**3. Preserve existing `main_category` (idempotency guard)**

If a source already has a valid `main_category` from a prior LLM-enriched run, and the current run used the deterministic fallback (no LLM, `understanding.llm_used=false`), keep the existing value rather than downgrading to `unclear_or_adjacent`.

**4. Fallback**

`unclear_or_adjacent` — source is not included in the analysis layer dossiers.

---

## Idempotency

Sources already stamped with `CLASSIFY_VERSION = "classify-v6.0"` are returned unchanged. This prevents re-classification of sources that were previously classified with full LLM context.

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `main_category` | string | One of the 5 categories above |
| `classification_confidence` | high\|medium\|low\|none | Confidence of the assignment |
| `classify_version` | string | Idempotency stamp |

---

## Batch Processing

`classifySources(sources)` runs `classifySource()` on every source synchronously (no async, no LLM). Returns:

```js
{
  sources: object[],
  counts: {
    total, already_done, newly_done,
    high_conf, medium_conf, unclear,
    distribution: { [category]: count },
  }
}
```
