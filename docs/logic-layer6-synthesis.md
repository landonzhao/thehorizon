# Layer 6 — Synthesis Orchestrator

**File:** `lib/pipeline/synthesis/synthesisLayer.js`
**No direct LLM calls.** All LLM calls are delegated to branch orchestrators.

---

## Purpose

Top-level orchestrator that sequences Layer 5a (rawfact), Layer 5b (analytics), and Layer 8 (analysis) into a single synthesis result. The slides layer consumes this output directly.

---

## Pipeline

```
sources[] (from Layer 4 + Classification)
  each source has main_category set by classifyCategory.js — see logic-classification.md
    │
    ▼
Layer 6.1 — Rawfact branch        runRawfactBranch()
  7.1A: Rawfact taxonomy           LLM per source
  7.1B: Evidence cards             LLM for high-priority sources
  7.1C: Rawfact scoring            deterministic, 2 passes
  7.1D: Rawfact clustering         deterministic Jaccard
    │
    ▼
Layer 6.2 — Analytics branch      runAnalyticsBranch()
  7.2A: Analytics taxonomy         LLM per source
  7.2B: Analytics aggregation      deterministic
  7.2C: Visualization specs        deterministic
    │
    ▼
Layer 6.3 — Analysis layer        runAnalysisLayer()
  8A: Category evidence dossier    deterministic
  8B: Category analysis LLM        LLM per active category
  8C: Evidence linking             deterministic
  8D: Analysis QA                  deterministic + optional LLM
    │
    ▼
synthesisResult
```

---

## LLM Key Requirements by Sub-step

| Sub-step | Minimum keys needed | Notes |
|----------|-------------------|-------|
| 7.1A Rawfact taxonomy | Any OPENAI/GROQ/GEMINI | Groq uses JSON mode |
| 7.1B Evidence cards | Any OPENAI/GROQ/GEMINI | High-priority sources only |
| 7.2A Analytics taxonomy | Any OPENAI/GROQ/GEMINI | Groq uses JSON mode |
| 8B Category analysis | OPENAI or GEMINI only | Groq NOT used — requires strict JSON schema |
| 8D LLM QA (opt-in) | OPENAI or GEMINI only | Disabled by default |

---

## Input

```js
sources[]  // Layer-4-enriched sources with understanding, source_type, main_category
opts: {
  skipLlm: false,  // skip all LLM calls (use deterministic fallbacks throughout)
}
```

---

## Output

```js
{
  feed_sources: object[],          // all sources, fully enriched through all branches
  analytics: {
    aggregates: object,            // from Layer 7.2B
    visualization_specs: object[], // from Layer 7.2C
  },
  category_analyses: object[],     // from Layer 8D (QA'd)
  dossiers: object[],              // from Layer 8A (evidence dossiers per category)

  viewpoints: [],                  // always empty — kept for backward compat

  counts: {
    total_sources: number,
    high_priority: number,         // must_read + high rawfact sources
    evidence_cards: number,
    clusters: number,              // multi-source clusters
    insights: number,
    early_signals: number,
    viewpoints: 0,
    rawfact: { ... },              // full rawfact counts
    analysis_summary: { ... },     // per-category insight/signal counts
    qa_report: { ... },            // analysis QA report
  },

  synthesis_version: "synthesis-v7.1",
}
```

`dossiers[]` is threaded through to `runSlidesLayer()` so the slides layer can access rawfact evidence directly for evidence callouts.

`viewpoints` is always an empty array. The old viewpoint-based synthesis pipeline has been replaced by the category analysis pipeline; the field is retained for backward compatibility with slides/QA layers that may reference it.

---

## Zero-Sources Short-Circuit

If `sources.length === 0`, returns immediately with zeroed counts and empty arrays. No LLM calls are made.
