# Pipeline Architecture

## Overview

The Horizon platform is a RAG-style intelligence production system. It ingests AI/security-related sources from connectors and feeds, validates and cleans them, stores them in Supabase, then retrieves and processes that evidence to generate structured analysis and presentation-ready outputs.

The pipeline runs in two distinct phases that operate independently:

**Ingestion phase** runs on a daily cron (22:00 UTC via `/api/refresh`). It collects new sources from external connectors, cleans and validates them, and persists them to the database.

**Analysis phase** runs on demand (via `scripts/runHorizonScanMVP.js` or `pipelineRunner.js`). It loads stored sources, enriches them with LLM understanding, extracts and scores evidence, runs category-level analysis, and produces slide decks with speaker scripts.

Outputs:
- `.pptx` slide deck using the CSA template
- Speaker script (`.md`)
- Structured evidence packet (`.json`)
- Chart and visualization data
- QA report

---

## End-to-End Flow

```
[Ingestion Phase — daily cron]

 Layer 1 — Ingest
    Connectors: arXiv, NVD, RSS feeds, LLM discovery
          ↓
 Layer 2 — Clean
    Text normalization, deduplication, structured content extraction
          ↓
 Layer 3 — Classify
    Validity checks, AI-relevance scoring, source typing, trust assessment, gate

[Analysis Phase — on demand]

 Layer 4 — Understand
    LLM taxonomy: source type, framework tags, claims, category candidates
          ↓
 Layer 5 — Classify Category
    Deterministic: picks main_category from Layer 4 candidates
          ↓
 Layer 6 — Synthesis  ──────────────────────────────────────┐
    │                                                        │
    ├── 6a. Rawfact Branch                                   │
    │       Taxonomy → Evidence Cards → Score → Cluster      │
    │                                                        │
    ├── 6b. Analytics Branch                                 │
    │       Taxonomy → Aggregation → Visualization Specs     │
    │                                                        │
    └── 6c. Analysis Layer ──────────────────────────────────┘
            Dossiers → Category Analysis → Evidence Linking → QA
          ↓
 Layer 7 — Slides
    Deck Planning → Slide Content → Speaker Notes → Export
          ↓
 Layer 8 — QA
    Structural checks, citation validation, phrase audits
```

---

## Layer Responsibilities

### Layer 1 — Ingest

Collects raw sources from external connectors and normalises them into a common schema before any further processing.

**Connectors:**
- `arxivConnector.js` — runs 6 targeted queries covering different AI security subtopics; rate-limited (3s between queries, 8s between weekly chunks during backfill)
- `nvdConnector.js` — National Vulnerability Database CVE feed filtered for AI-relevant identifiers
- `registryFeedConnector.js` — RSS/Atom feeds from trusted publishers (CISA, NCSC, vendor security blogs, etc.)
- `llmDiscoveryConnector.js` — LLM-assisted source discovery using web-search-enabled Gemini; produces URL candidates for human-curated sources

Each source is normalised to a common shape: `title`, `url`, `publisher`, `date_published`, `full_text`, `summary`, `trust_tier`. Source IDs are derived from a sha256 hash of the canonical URL, making every ingest idempotent — re-ingesting the same URL upserts rather than duplicates.

**Tooling:** deterministic connector code + Gemini for LLM discovery.

---

### Layer 2 — Clean

Normalises raw text and removes duplicates before classification.

**Steps:**
1. Strip HTML tags, LaTeX markup, and boilerplate. Collapse whitespace and normalise encoding. Extract code blocks and IOC patterns (CVE IDs, IP addresses, domains, hashes). Truncate to 10,000 characters.
2. Exact deduplication on canonical URL, normalised title, and content hash.
3. Near-duplicate detection using Jaccard title similarity (threshold ≥ 0.85). The higher-trust-tier source is kept when near-duplicates are found.

**Tooling:** fully deterministic.

---

### Layer 3 — Classify

Five deterministic sublayers validate each source and assign initial metadata. No LLM calls.

| Sublayer | What it does |
|----------|-------------|
| 3.1 `sourceValidity` | Hard-fail flags (no URL, excluded publisher, duplicate URL). Soft flags (missing publisher, possible non-English, date before 2020, minimal text). |
| 3.2 `aiRelevance` | Scores AI/cyber signal strength using weighted keyword dictionaries. Assigns `relevance_tier`: core ≥ 40, adjacent ≥ 20, peripheral ≥ 10, off-topic < 10. Also sets `ai_specificity_score` (0–100). |
| 3.3 `dataTyping` | Rule-based assignment of `source_type` from 16 types (vulnerability, incident, research_finding, governance_signal, etc.) using URL patterns and publisher registry. |
| 3.4 `trustAssessment` | Assigns `trust_tier` (primary / high / medium / low / curated / unknown) from a publisher registry. Primary: government agencies and AI labs. High: major security vendors and academic sources. |
| 3.5 `finalGate` | Hard reject for off-topic or invalid sources. Sends remainder to `layer3_status: pass` or `review`. Sets `downstream_route` (`layer4 / layer4_with_review / discard`). Curated sources (trust_tier = curated) are never rejected. |

**Tooling:** fully deterministic.

---

### Layer 4 — Understand

LLM deep understanding of each source. Produces taxonomy tags, a structured summary, and category candidates for Layer 5 to resolve.

**LLM call:** `callLLM()` with provider rotation. Models: `gpt-4o-mini` (OpenAI primary/secondary), `llama-3.3-70b-versatile` (Groq, JSON mode — no json_schema), `gemini-2.0-flash` / `gemini-2.5-flash` (Gemini key 1/2). Trigger: any provider key present and `skipLlm=false`. Label: `Layer5-taxonomy`.

The system prompt includes the full controlled taxonomy registry (OWASP Top 10 for LLM, MITRE ATLAS, MITRE ATT&CK, NIST AI RMF, INTERNAL). The user prompt supplies: title, publisher, date, deterministic pre-classification hint, summary (≤500 chars), source text (≤2500 chars), and existing tags.

**Output fields added to source:**
- `source_type` — one of 16 types
- `understanding.source_summary` — 2–3 sentence analyst summary
- `understanding.primary_subject` — ≤15 words
- `understanding.main_claims` — 2–5 factual claims
- `understanding.key_entities` — named systems, orgs, CVEs, groups
- `understanding.important_numbers` — quantitative data points
- `understanding.framework_tags` — validated controlled taxonomy tags (max 5)
- `understanding.category_candidates` — ranked category suggestions for Layer 5
- `taxonomy_version` — idempotency stamp (`taxonomy-v5.0`)

**Fallback (no keys or `--no-llm`):** `deterministicFallback()` — uses rule-based source typing and keyword matching for category candidates.

**Tooling:** LLM with deterministic post-processing (tag validation, schema enforcement, Groq output normalisation).

---

### Layer 5 — Classify Category

Deterministic. Picks exactly one `main_category` from the `category_candidates` produced by Layer 4. No LLM call.

**Decision logic (priority order):**
1. Candidates with `confidence: "high"` → pick the first (highest framework_tag support).
2. Multiple `"medium"` candidates → pick by `supporting_tags` count.
3. Only `"low"` candidates → pick by `supporting_tags` count.
4. No valid candidates → `unclear_or_adjacent`.

If no LLM was used in Layer 4, and the source already has an existing `main_category` set, that value is preserved rather than overwritten by a keyword-only fallback.

**Output fields:** `main_category`, `classification_confidence`, `classify_version` (`classify-v6.0`).

**Tooling:** fully deterministic.

---

### Layer 6 — Synthesis

Top-level orchestrator that runs three sub-branches in sequence: rawfact, analytics, and analysis. Contains no direct LLM calls — all LLM calls are delegated to branch files.

---

#### Layer 6a — Rawfact Branch

Extracts and ranks the most useful factual evidence from each source for later use in slides and analysis.

**Step 7.1A — Rawfact Taxonomy (LLM)**

Assigns source-type-aware metadata to guide evidence extraction. The prompt is aware of source type and produces different fields depending on whether the source is a vulnerability disclosure, confirmed incident, research finding, governance signal, or other type. Outputs: `operational_relevance`, `novelty`, `impact_severity`, `impact_scope`, `sector`, `technology`, `source_type_context`.

- LLM: `callLLM()`, all providers (Groq degrades to JSON mode). Concurrency: 5. Label: `Layer7.1A-taxonomy-<id>`.
- Fallback: rule-based mapping from `source_type` and `trust_tier`.

**Step 7.1B — Evidence Card Extraction (LLM)**

Extracts a structured evidence card for high-priority sources only (those with `operational_relevance: very_high/high` or initial score `must_read/high`). Roughly 25% of sources receive evidence cards.

Output per card: `evidence_card_title`, `short_summary`, `key_facts[]`, `numbers_statistics[]`, `attack_flow[]`, `impacts[]`, `why_it_matters`, `best_used_for[]`.

- LLM: `callLLM()`, all providers. Concurrency: 5. Label: `Layer7.1B-evidence-<id>`.
- Fallback: evidence card skipped (source not failed, just not extracted).

**Step 7.1C — Rawfact Scoring (deterministic, two passes)**

Scores each source on a 0–100 scale using a fully deterministic formula. Called twice per pipeline run — once before clustering and once after — so that clustering can identify the best representative before the duplicate penalty is applied.

Score formula: `rawfact_score = common_base(0–40) + type_specific(0–45) + horizon_bonus(0–15) − penalties`

- `common_base` (0–40): `source_credibility` (trust_tier → 0–10) + `ai_relevance` (ai_specificity_score + category confidence → 0–10) + `evidence_concreteness` (key_facts count + numbers + attack_flow → 0–10) + `citation_quality` (0–5) + `recency` (days since publish → 0–5)
- `type_specific` (0–45): 15 separate scorers, one per source type (threat_intel_report, academic_paper, vulnerability_db, government_advisory, etc.). Each scorer weights different rawfact_taxonomy fields (operational_relevance, attack_vectors, technical_depth, CVE count, etc.).
- `horizon_bonus` (0–15): bonus for AI-specific attack chains, multi-vector techniques, novel methods, or high `ai_specificity_score`.
- `duplicate_penalty` (−10): applied in Pass 2 only to non-representative members of multi-source clusters.

**Priority bands:** must_read ≥ 85 | high 70–84 | medium 50–69 | low 30–49 | archive_only < 30.

**Step 7.1D — Jaccard Clustering (deterministic)**

Groups related sources within the same threat category to identify duplicate coverage and select the best representative for each topic cluster.

Algorithm:
1. Tokenise titles: lowercase, strip punctuation, remove stop words (34-word list), filter tokens shorter than 4 characters.
2. Compute pairwise Jaccard similarity for all source pairs within the same `main_category`. Cross-category pairs are never clustered.
3. Link pairs with Jaccard ≥ 0.35 (SIMILARITY_THRESHOLD).
4. Union-find merges transitively linked pairs into clusters.
5. Cluster representative = member with highest `rawfact_score` from Pass 1.
6. All other members marked `is_representative: false`.

Output per source: `rawfact_cluster { cluster_id, cluster_size, representative_title, is_multi_source, is_representative, cluster_theme }`.

After clustering, **Pass 2** of scoring applies the −10 duplicate penalty to non-representative members of multi-source clusters, then re-ranks priorities. This ensures the representative source retains its full score while near-duplicate coverage is demoted.

---

#### Layer 6b — Analytics Branch

Processes every source into structured, chart-ready analytical data that describes patterns across the full corpus.

**Step 7.2A — Analytics Taxonomy (LLM)**

Assigns controlled-vocabulary labels to each source for aggregation. The taxonomy uses 9 controlled vocabulary lists covering: `attack_vectors` (28+ values), `attack_surface` (21 values), `ai_layer` (12 values), `operational_status`, `threat_maturity`, `impact_scope`, `impact_type`, `signal_clusters` (20 values), and `recurring_themes` (12 values).

- LLM: `callLLM()`, all providers (Groq degrades to JSON mode). Concurrency: 5. Label: `Layer7.2A-analytics-<id>`.
- Fallback: deterministic mapping from `source_type` and `trust_tier`.

**Step 7.2B — Analytics Aggregation (deterministic)**

Aggregates per-source taxonomy fields into corpus-wide counts and distributions. No LLM involved.

Outputs: `category_counts`, `source_type_counts`, `trust_tier_counts`, `attack_vector_frequency` (sorted by frequency), `signal_cluster_counts`, `maturity_distribution`, `ai_layer_distribution`, `monthly_timeline` (per YYYY-MM with by-category breakdown), `category_breakdown` (per category: top vectors, clusters, maturity spread, type distribution), `date_range`.

**Step 7.2C — Visualization Specs (deterministic)**

Generates 12+ chart-ready visualization specifications. Each spec has a stable `visualization_id` that is cited by the slides layer to assign charts to specific slides.

Chart types: bar, stacked bar, heatmap, radar, matrix (category × maturity), timeline. Examples: `attack_vector_frequency` (bar), `maturity_distribution` (bar), `signal_cluster_radar` (radar), `monthly_source_timeline` (timeline), `category_maturity_matrix` (matrix), `category_vector_heatmap` (heatmap).

**Optional LLM step (disabled by default):** `runVisualizationRecommendations()` — recommends which charts to use in which slide sections. Enabled with `skipVizRecommendation: false`. Falls back silently to an empty array.

---

#### Layer 6c — Analysis Layer

Uses rawfact evidence and analytics aggregates to produce category-level intelligence. One LLM call per active category. Groq is excluded here — citation-traced structured output requires `json_schema` support.

**Step 8A — Dossier Builder (deterministic)**

Selects evidence to send to the LLM for each active category: up to 12 rawfact evidence items (ranked by `rawfact_score`, must_read first) and up to 4 analytics evidence items (top attack vectors, maturity distribution, signal cluster counts, monthly trend). Evidence items are assigned stable IDs in the format `raw_<source_id>` (rawfact) and `agg_<category>_<metric>` (analytics).

**Step 8B — Category Analysis (LLM)**

One LLM call per active category (minimum 2 sources required). Providers: OpenAI or Gemini only. Label: `Layer8B-<category>`.

Produces per category: `overview` (2–3 sentences), `top_insights` (3–5 items, each with `insight` ≤25 words, `supporting_evidence_ids[]`, `confidence`, `implication`), `early_signals` (0–3 items with `signal`, `horizon`, `confidence`), `outlook` (6-month directional statement with `supporting_evidence_ids[]`), `analysis_confidence`.

Every insight and early signal must reference evidence IDs from the dossier — the LLM cannot introduce unsupported claims.

Fallback: `deterministicAnalysis()` — one insight per top rawfact item, confidence set to `low`.

**Step 8C — Evidence Linking (deterministic)**

Resolves all `evidence_id` references in the analysis output to full source objects. `raw_<id>` resolves to the rawfact source by ID. `agg_<cat>_<metric>` resolves to the matching analytics aggregate. Unresolvable IDs are silently dropped. Builds a `citations[]` list per analysis in the format "Publisher — Title (Date)".

**Step 8D — Analysis QA (deterministic + optional LLM)**

Deterministic pass: removes insights with no resolved evidence, insight text shorter than 15 words, or missing key fields. Downgrades `analysis_confidence` if retention rate falls below 50%. Optional LLM fact-check (disabled by default, `skipLlmQa: true`) calls all providers to verify each insight against its cited evidence summaries.

---

### Layer 7 — Slides

Produces the final deck from synthesis output.

**Step 1 — Deck Planning (deterministic)**

Maps category analyses + dossiers + analytics into a dynamic slide structure. Slide count formula: 9 slides for 1 active category, 3+2N+5 for N active categories. Each planned slide is assigned `rawfact_evidence[]`, `analytics_evidence[]`, `visualization_ids[]`, a `speaker_note_intent`, and a `core_message`. Slide types: `title`, `executive_overview`, `category_deep_dive`, `category_evidence`, `cross_category`, `outlook`, `closing`, `section_divider`, `appendix`.

**Step 2 — Slide Content Generation (LLM)**

Generates structured content for each non-structural slide. Providers: OpenAI or Gemini only (Groq excluded — citation-traced structured output requires json_schema). Concurrency: 3. Label: `Layer7-slide<N>-<type>`.

Output per slide: `title`, `headline` (≤20 words), `bullets[]` (≤15 words each), `evidence_callouts[]` (must copy evidence_id exactly from dossier), `citations[]`, `visualization_ids[]`.

Deterministic fallback: `deterministicSlide()` — title + plan bullets + top evidence items.

**Step 3 — Speaker Notes (LLM)**

Runs after Step 2 — uses finalized slide content only. Produces 5–8 sentence plain-text paragraphs per slide. Providers: OpenAI or Gemini. Concurrency: 3. Label: `Layer7-notes-<N>`. Only run when `--detailed-notes` flag is passed.

**Step 4 — Export (deterministic)**

Writes outputs to `outputs/final/`:
- `horizon_scan_deck.pptx` — rendered via `exportPptx.js` using the CSA template (`templates/AI x Security (for AISP projection) (1).pptx`). Canvas: 13.33"×7.5". Font: Aptos. CSA palette: accent1 `#3583C9`, accent2 `#9C62A7`, accent3 `#19BC9D`, accent4 `#FFAA22`, accent5 `#004987`, accent6 `#CC0033`.
- `slide_deck_output.json` — raw slide objects
- `speaker_script.md` — markdown speaker script

**Tooling:** LLM for content generation, fully deterministic for planning and rendering.

---

### Layer 8 — QA

Final quality gate before delivery. Fully deterministic — no LLM calls.

Four check modules:

| Module | What it checks |
|--------|---------------|
| Viewpoint QA | No-op (viewpoints deprecated in favour of category_analyses). |
| Slide QA | Every slide has a title and headline. Structural slides (title, section_divider, appendix) are exempt from content checks. Severity: error for missing title, warning for missing evidence callouts on deep-dive slides. |
| Citation QA | Every `evidence_callout` in every slide references a valid `evidence_id` from the dossier. Coverage check: what percentage of must-read and high-priority sources appear in at least one slide. |
| Number/Phrase QA | Percentage values in range 0–100, years in range 2020–2030, no banned filler phrases ("it is worth noting", "it is important to note", "in today's rapidly evolving landscape", etc.). |

**Output:** `{ overall_pass, slide_qa, citation_qa, number_qa, summary: { errors, warnings, infos } }`.

---

## Tooling Philosophy

| Task | Tool |
|------|------|
| URL canonicalization, hashing, deduplication | Deterministic code |
| Date filtering, schema validation | Deterministic code |
| SQL aggregations, chart data generation | Deterministic code |
| PPTX rendering from template | Deterministic code (PptxGenJS / python-pptx) |
| Source understanding, framework mapping, fact extraction | LLM (OpenAI / Gemini primary; Groq for per-source steps) |
| Category-level analysis, slide content drafting | LLM (OpenAI / Gemini only — Groq excluded) |
| Speaker script | LLM (all providers) |

The pipeline does not ask the LLM to write a deck from scratch. It asks the LLM — given category-level insights, supporting rawfact evidence, analytics outputs, and visualization options — to produce content for a pre-planned slide structure backed by traceable evidence.
