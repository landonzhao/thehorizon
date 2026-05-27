# Layer 6 — Synthesis

## Purpose

Transform the per-source intelligence from Layer 5 into four products that slide-generation layers (Layers 7–8) consume directly:

1. **Feed sources** — enriched with feed taxonomy, scores, evidence cards, and cluster assignments
2. **Analytics** — aggregated statistics, maturity distributions, attack-vector frequencies, visualization specs
3. **Category analyses** — per-category strategic briefs (overview, insights, signals, outlook)
4. **Viewpoints** — LLM-synthesized strategic analyst claims backed by specific evidence citations

---

## Entry Point

| File | Purpose |
|------|---------|
| `lib/pipeline/synthesis/synthesisLayer.js` | Main Layer 6 orchestrator |

```js
import { runSynthesisLayer, SYNTHESIS_VERSION } from "./lib/pipeline/synthesis/synthesisLayer.js";

const { feed_sources, analytics, category_analyses, viewpoints, counts } =
  await runSynthesisLayer(understoodSources, { skipLlm: false });
```

**Input**: sources from Layer 5 with `understanding`, `source_type`, `main_category`, and `understand_version` set.  
**Output**: `{ feed_sources, analytics, category_analyses, viewpoints, counts, synthesis_version }`.

---

## Sublayer Structure

```
Layer 6.1 — Rawfact Branch (deterministic + LLM for evidence)
  6.1A: feedTaxonomy.js      — sector, geography, technology, impact, novelty signals
  6.1B: feedScoring.js       — composite 0–100 score + feed_priority tier
  6.1C: evidenceExtraction.js — LLM evidence cards for must_read/high sources
  6.1D: clusterRawfacts.js   — group related sources by title similarity (deterministic)

Layer 6.2 — Analytics Branch (deterministic)
  6.2A: analyticsTaxonomy.js    — operational status, maturity, AI layer, signal clusters
  6.2B: analyticsAggregation.js — global counts, distributions, timeline
  6.2C: visualizationSpecs.js   — chart specs ready for slide rendering

Layer 6.3 — Category Analysis (LLM, 1 call per category)
  analyzeCategories.js  — structured brief per threat category

Layer 6.4 — Viewpoint Synthesis (LLM + deterministic)
  6.4A: synthesizeViewpoints.js  — 8–12 cross-category strategic viewpoints
  6.4B: supportViewpoints.js     — link source-ID citations to full objects
```

---

## Layer 6.1 — Rawfact Branch

### 6.1A — Feed Taxonomy (`feedTaxonomy.js`)

Deterministic. Assigns contextual signals to each source for feed rendering:

| Field | What it captures |
|-------|-----------------|
| `feed_tags` | Combined source tags + framework tag names from Layer 5 |
| `sector` | Affected sectors: `financial_services`, `healthcare`, `energy`, `government`, `defense`, `cross_sector` |
| `geography` | Attributed or affected geographies: `china`, `russia`, `iran`, `north_korea`, `united_states`, `europe`, `global` |
| `technology` | AI/cyber stack: `llm`, `ai_agent`, `rag`, `synthetic_media`, `malware`, `model_supply_chain`, `ml_model`, `api` |
| `impact_type` | `financial`, `confidentiality`, `reputational`, `security`, `operational` |
| `impact_scope` | `organization`, `sector`, or `ecosystem` (from source_type) |
| `impact_severity` | `high`, `medium`, `low`, `unknown` (from source_type) |
| `operational_relevance` | `very_high`, `high`, `medium`, `low` (from source_type) |
| `novelty` | `new_tactic`, `known_tactic_new_scale`, `known_tactic` |
| `source_type_context` | Type-specific extra fields (exploitability for vulns, confirmed impact for incidents) |

### 6.1B — Feed Scoring (`feedScoring.js`)

Deterministic. Computes a 0–100 feed score:

| Component | Max pts |
|-----------|---------|
| Trust tier (`primary`=90, `curated`=85, `high`=75, `medium`=55, `low`=30, `unknown`=20) | 90 |
| Source type urgency (`vulnerability`/`incident`=25, `exploit_disclosure`=22, `threat_intelligence`=20) | 25 |
| AI relevance score (normalised from Layer 2 `ai_specificity_score`) | 6 |
| Horizon bonus (+10 when LLM confirmed a non-uncategorised category with confidence ≥ medium) | 10 |
| Credibility bonus (trust_tier-based) | 10 |
| Noise penalty (filter flags × −3, capped −15) | −15 |

**Feed priority tiers:**

| `feed_priority` | `feed_score` |
|----------------|-------------|
| `must_read` | ≥ 80 |
| `high` | 65–79 |
| `medium` | 45–64 |
| `low` | 25–44 |
| `archive_only` | < 25 |

### 6.1C — Evidence Card Extraction (`evidenceExtraction.js`)

LLM-powered. Only runs for `must_read` and `high` priority sources. Up to 5 concurrent calls.

**Output per source (`evidence_card`):**

| Field | Content |
|-------|---------|
| `evidence_card_title` | Punchy slide-ready title (≤10 words) |
| `short_summary` | 1–2 sentences for a slide body |
| `key_facts` | 3–5 specific verifiable facts |
| `numbers_statistics` | Quantitative data ("87%: attack success rate against GPT-4o") |
| `attack_flow` | Step-by-step attack sequence |
| `impacts` | Concrete impact statements |
| `why_it_matters` | Strategic significance for defenders (1 sentence) |
| `best_used_for` | Slide use tags: `trend_support`, `case_study`, `outlook_support`, `visual_annotation`, `stat_callout` |

Lower-priority sources receive `evidence_card: null`.

See `docs/prompts/layer6-evidence-extraction.md` for the full prompt.

### 6.1D — Rawfact Clustering (`clusterRawfacts.js`)

Deterministic. Groups related sources into event/topic clusters using Jaccard similarity on significant title words, within each threat category.

**Why:** Multiple sources often cover the same underlying event (e.g. 4 papers about the same jailbreak campaign). Without clustering, the category analysis and viewpoint synthesis would treat these as 4 independent data points, inflating confidence. Clustering lets the LLM identify corroboration vs. independent discovery.

**Method:**
- Extract significant title words (3+ chars, exclude stop words)
- Compute Jaccard similarity for all source pairs within a category
- Union-find grouping at ≥35% similarity threshold
- Representative title = highest-scored source in the cluster

**Output per source (`rawfact_cluster`):**

| Field | Content |
|-------|---------|
| `cluster_id` | `cl_0001`, `cl_0002`, ... |
| `cluster_size` | Number of sources in cluster |
| `representative_title` | Title of top-scored source in cluster |
| `is_multi_source` | `true` if cluster has 2+ sources |

The `[CLUSTER:...]` annotation in the category analysis prompt signals multi-source clusters.

---

## Layer 6.2 — Analytics Branch

### 6.2A — Analytics Taxonomy (`analyticsTaxonomy.js`)

Deterministic. Assigns analytics-specific labels:

| Field | Values |
|-------|--------|
| `analytics_date` | ISO date string |
| `analytics_category` | maps `main_category` |
| `analytics_source_type` | maps `source_type` |
| `analytics_attack_vectors` | MITRE ATLAS/ATT&CK tag names (LLM tags), with category-keyword fallback |
| `analytics_attack_surface` | from feed_taxonomy `technology` |
| `analytics_ai_layer` | `model`, `data`, `application`, `agent` |
| `analytics_operational_status` | `active_operational_use`, `limited_operational_use`, `proof_of_concept`, `research_only` |
| `analytics_maturity` | `research`, `emerging`, `growing`, `operational`, `mainstream` |
| `analytics_signal_clusters` | e.g. `prompt_injection`, `agent_exploitation`, `model_attacks` |

### 6.2B — Analytics Aggregation (`analyticsAggregation.js`)

Deterministic. Aggregates across all sources:

| Output | Description |
|--------|-------------|
| `category_counts` | Source counts per threat category |
| `source_type_counts` | Source counts per source type |
| `attack_vector_frequency` | Most common MITRE techniques |
| `attack_surface_frequency` | Most affected technology stacks |
| `maturity_distribution` | Distribution across maturity levels |
| `timeline_events` | Sorted list of dated sources |
| `signal_cluster_counts` | Frequency of signal cluster tags |
| `ai_layer_frequency` | Frequency of AI stack layer involvement |
| `date_range` | Earliest and latest source dates |

### 6.2C — Visualization Specs (`visualizationSpecs.js`)

Deterministic. Generates chart specifications for slide rendering:

| Spec ID | Type | Use |
|---------|------|-----|
| `category_distribution` | bar_chart | Threat landscape overview |
| `source_type_distribution` | bar_chart | Executive overview |
| `maturity_matrix` | matrix | Research-to-operational tracker |
| `attack_vector_frequency` | bar_chart | Attack technique frequency |
| `signal_cluster_radar` | radar_chart | Category risk balance |
| `timeline` | timeline | Chronological event sequence |

---

## Layer 6.3 — Category Analysis (`analyzeCategories.js`)

LLM-powered. One focused call per active threat category. Up to 3 concurrent.

**Why a separate sublayer:** A single synthesis call over 500+ sources produces shallow viewpoints because the model loses category-specific nuance. Per-category calls (8 top sources each) let the model reason in depth about one threat domain, surface non-obvious cross-source insights, and produce a structured brief that viewpoint synthesis can then combine and contrast.

**Input per category call:**
- Top 8 sources by feed score (with cluster annotations for multi-source groups)
- Per-category source type breakdown, maturity distribution, top attack vectors

**Output per category (`category_analyses[i]`):**

| Field | Content |
|-------|---------|
| `category` | Threat category name |
| `overview` | 2–3 sentence dominant story this period |
| `top_insights` | 3–5 non-obvious cross-source conclusions |
| `early_signals` | 0–3 weak signals worth watching (format: SIGNAL/IMPLICATION) |
| `outlook` | 1–2 sentence 3–6 month projection |
| `recommended_visuals` | 1–3 chart suggestions |
| `confidence` | `high` (6+ quality sources) / `medium` / `low` |
| `key_source_ids` | 3–5 source IDs most influential in the analysis |

See `docs/prompts/layer6-category-analysis.md` for the full prompt.

**Deterministic fallback:** `deterministicAnalysis()` builds a brief from `evidence_card.key_facts` and `understanding.main_claims`. Confidence defaults to `low`.

**Token budget:** ~2,000 tokens × 5 categories = ~10,000 tokens per run ≈ $0.0015 at gpt-4o-mini pricing.

---

## Layer 6.4 — Viewpoint Synthesis

### 6.4A — Viewpoint Synthesis (`synthesizeViewpoints.js`)

LLM-powered. Takes top evidence sources, aggregated analytics, **and the Layer 6.3 category analyses** as structured context, and produces 8–12 strategic viewpoints.

**Evidence selection:** Top 4 sources per category by `feed_score`, deduplicated by ID.

**Category analyses in prompt:** The structured category briefs from Layer 6.3 are appended to the user prompt, enabling the model to generate higher-quality cross-category viewpoints without processing hundreds of raw sources. When category analyses are absent (LLM unavailable), the model falls back to raw evidence only.

**Output per viewpoint:**

| Field | Content |
|-------|---------|
| `viewpoint_id` | Sequential ID: `vp_001`, `vp_002`, ... |
| `category` | One of the 4 offensive categories or `cross_category` |
| `viewpoint` | 1–2 sentence strategic claim |
| `claim_type` | `trend`, `insight`, `early_signal`, `outlook`, `implication` |
| `supporting_feed_evidence` | Source IDs backing the claim |
| `supporting_analytics` | Aggregate stats reinforcing the claim |
| `confidence` | `high` / `medium` / `low` |
| `maturity` | `research` → `emerging` → `growing` → `operational` → `mainstream` |
| `watch_window` | `now`, `3_6_months`, or `6_12_months` |
| `speaker_note` | 2–3 sentences for the presenter |

See `docs/prompts/layer6-viewpoint-synthesis.md` for the full prompt.

### 6.4B — Evidence Linking (`supportViewpoints.js`)

Deterministic. Resolves source-ID strings in `supporting_feed_evidence` into compact citation objects (`supporting_sources`).

Each citation includes: `id`, `title`, `url`, `publisher`, `date_published`, `source_type`, `main_category`, `trust_tier`, `feed_score`, `feed_priority`, `source_summary`, `key_facts`, `framework_refs`.

---

## Output

```js
{
  feed_sources: [...],  // carry all: understanding, feed_taxonomy, feed_score_data,
                        // evidence_card, rawfact_cluster, analytics_taxonomy

  analytics: {
    aggregates:          { category_counts, source_type_counts, attack_vector_frequency, ... },
    visualization_specs: [ { visualization_id, visualization_type, title, chart_data, ... } ],
  },

  category_analyses: [
    {
      category:            "llm_threats",
      overview:            "string",
      top_insights:        ["string", ...],
      early_signals:       ["SIGNAL: ... IMPLICATION: ...", ...],
      outlook:             "string",
      recommended_visuals: ["string", ...],
      confidence:          "high | medium | low",
      key_source_ids:      ["src-id", ...],
    }
  ],

  viewpoints: [
    {
      viewpoint_id:             "vp_001",
      category:                 "llm_threats",
      viewpoint:                "string",
      claim_type:               "trend",
      supporting_feed_evidence: ["src-id", ...],
      supporting_sources:       [{ id, title, url, ... }],  // resolved by 6.4B
      supporting_analytics:     ["string"],
      confidence:               "high",
      maturity:                 "operational",
      watch_window:             "now",
      speaker_note:             "string",
    }
  ],

  counts: {
    total_sources:  number,
    high_priority:  number,   // must_read + high
    evidence_cards: number,   // sources with non-null evidence_card
    clusters:       number,   // multi-source clusters found
    viewpoints:     number,
  },

  synthesis_version: "synthesis-v6.1",
}
```

---

## Cost Summary

Per full pipeline run (500 sources, typical):

| Step | Calls | ~Tokens | ~Cost (gpt-4o-mini) |
|------|-------|---------|---------------------|
| 6.1C Evidence cards | 60–80 | ~130K | ~$0.020 |
| 6.3 Category analysis | 5 | ~10K | ~$0.002 |
| 6.4A Viewpoint synthesis | 1 | ~4K | ~$0.001 |
| **Total** | | **~144K** | **~$0.023** |

The two-stage synthesis (6.3 → 6.4) adds only ~5 calls and ~$0.002 over a single-call approach, while producing substantially richer viewpoints.


