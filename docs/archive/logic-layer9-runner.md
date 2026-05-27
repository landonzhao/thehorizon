# Layer 9 — Pipeline Runner & Deck Persistence

## Purpose

Wires Layers 5–8 into a single end-to-end run. Loads sources from Supabase, enriches any unenriched sources (Layer 5), synthesises strategic viewpoints (Layer 6), generates the slide deck (Layer 7), runs QA (Layer 8), and persists the output.

Layer 9 is the **integration layer** — it owns no business logic of its own, only orchestration and persistence.

---

## Entry Points

| Entry point | Use case |
|-------------|---------|
| `scripts/runHorizonScanMVP.js` | Local full-pipeline run (primary way to generate a deck) |
| `api/generate-report.js` | Read the latest stored deck via HTTP (GET only) |
| `lib/pipeline/runner/pipelineRunner.js` | Importable function for other scripts |

### Script

```bash
# Load 90 days of sources from Supabase, run all layers with live LLM
node scripts/runHorizonScanMVP.js

# Faster dev run: skip LLM, load from a JSON file, don't persist
node scripts/runHorizonScanMVP.js --no-llm --source-file outputs/debug/sample.json --no-persist

# Narrow date window
node scripts/runHorizonScanMVP.js --start 2026-01-01 --end 2026-05-01

# Markdown + PPTX output
node scripts/runHorizonScanMVP.js --format all --pptx-out /tmp/deck.pptx
```

### Programmatic

```js
import { runPipeline } from "./lib/pipeline/runner/pipelineRunner.js";

const result = await runPipeline({
  windowDays: 90,
  skipLlm: false,
  exportFormat: "all",
  outputPath: "/tmp/deck.pptx",
});

console.log(result.qaResult.overall_pass);   // true/false
console.log(result.stored.deck_id);          // "deck-2026-05-26"
```

---

## Pipeline Steps

```
Step 1  Load     → listSources() from Supabase (or accept explicitSources array)
Step 2  Understand → understandSources() [Layer 5] + persistUnderstandResults()
Step 3  Synthesis → runSynthesisLayer() [Layer 6]
Step 4  Slides   → runSlidesLayer() [Layer 7]
Step 5  QA       → runQALayer() [Layer 8]
Step 6  Persist  → saveDeck() → Supabase `decks` table + Vercel Blob
```

---

## Files

| File | Purpose |
|------|---------|
| `lib/pipeline/runner/pipelineRunner.js` | Main orchestrator — exports `runPipeline()` |
| `lib/storage/deckStore.js` | Read/write the `decks` Supabase table; upload full JSON to Vercel Blob |
| `lib/storage/sourceEnrichmentStore.js` | Write Layer 5 understand results back to `sources` table |
| `scripts/runHorizonScanMVP.js` | CLI wrapper — loads sources, calls `runPipeline()`, saves files |
| `api/generate-report.js` | HTTP read endpoint — returns latest deck metadata + blob URL |
| `docs/migrations/deck-layer9.sql` | Creates the `decks` table |

---

## `runPipeline` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sources` | `object[]` | `null` | Pre-loaded sources; skips DB load |
| `windowDays` | `number` | `90` | Days of sources to load from DB |
| `windowStart` | `string` | `null` | Start date override ("YYYY-MM-DD") |
| `windowEnd` | `string` | `null` | End date override ("YYYY-MM-DD") |
| `skipLlm` | `boolean` | `false` | Deterministic fallbacks everywhere |
| `persistUnderstand` | `boolean` | `true` | Write Layer 5 back to sources table |
| `persistDeck` | `boolean` | `true` | Save deck to Supabase + Vercel Blob |
| `detailedNotes` | `boolean` | `false` | Second-pass speaker notes (Layer 7 step 3) |
| `exportFormat` | `string` | `"all"` | `"markdown"` \| `"json"` \| `"pptx"` \| `"all"` |
| `outputPath` | `string` | `null` | PPTX output path (required when format = pptx) |
| `onProgress` | `Function` | `null` | `(step, message) => void` progress callback |

---

## Output

```js
{
  source_window:     { start, end },   // date window used
  source_count:      number,
  understand_counts: { total, already_done, llm_processed, fallback },
  synthesisResult,                     // Layer 6 output
  deckResult,                          // Layer 7 output
  qaResult,                            // Layer 8 output
  stored: { deck_id, blob_path },      // null when persistDeck=false
  runner_version: "runner-v9.0",
}
```

---

## Persistence

### `decks` table (Supabase)

Created by `docs/migrations/deck-layer9.sql`.

| Column | Type | Description |
|--------|------|-------------|
| `deck_id` | text PK | e.g. "deck-2026-05-26" |
| `generated_at` | timestamptz | When the deck was generated |
| `source_window_start/end` | date | Date range of sources used |
| `source_count` | integer | Total sources in the synthesis window |
| `must_read_count` | integer | must\_read + high priority sources |
| `viewpoint_count` | integer | Strategic viewpoints produced |
| `slide_count` | integer | Slides in the deck |
| `synthesis_version` | text | e.g. "synthesis-v6.0" |
| `deck_version` | text | e.g. "deck-v7.0" |
| `qa_version` | text | e.g. "qa-v8.0" |
| `overall_pass` | boolean | QA pass/fail |
| `qa_errors` | integer | Count of QA errors |
| `qa_warnings` | integer | Count of QA warnings |
| `coverage_pct` | integer | Citation coverage of high-priority sources |
| `blob_path` | text | URL to full deck JSON in Vercel Blob |

### Vercel Blob

Full deck payload (`synthesis + deck + qa`) stored at:
```
decks/YYYY-MM-DD/deck-YYYY-MM-DD.json
```

### Source enrichment

After Layer 5 runs, `persistUnderstandResults()` updates each enriched source in `sources` with:
- `understand_version` — idempotency stamp
- `source_type` — LLM-refined type
- `main_category` — LLM-refined category
- `intelligence` — full understanding JSON (maps from `source.understanding`)
- `claim_extraction_status` = "success"

Only writes sources with `understand_version === UNDERSTAND_VERSION`. Uses `UPDATE` (not upsert-with-ignoreDuplicates) so re-enrichment overwrites stale intelligence data.

---

## `api/generate-report.js` Endpoint

```
GET /api/generate-report
  → latest deck metadata row

GET /api/generate-report?deck_id=deck-2026-05-26
  → specific deck metadata row

GET /api/generate-report?list=1
  → array of 20 most recent deck rows
```

All responses include `blob_path` — the URL to the full deck JSON. The frontend fetches that URL directly for the slide and QA data.

**Deck generation is not triggered here.** Run `scripts/runHorizonScanMVP.js` to produce a deck. This endpoint is read-only.

---

## Design Notes

**Why scripts, not API?** The full pipeline (Layer 5 LLM enrichment + Layer 6 synthesis + Layer 7 slide generation) takes 2–10 minutes depending on source count and LLM throughput. Vercel Hobby serverless functions time out in 10–60 seconds. The runner is intentionally a script; the API only reads stored results.

**Idempotent understand step.** Sources stamped with `understand_version === UNDERSTAND_VERSION` are skipped by `understandSources()`. Re-running the pipeline on the same source set is safe and cheap — only new or updated sources consume LLM tokens.

**One deck per day.** `deck_id` defaults to `"deck-YYYY-MM-DD"`. Running the pipeline twice in one day overwrites the existing row (Supabase upsert on `deck_id`). The Vercel Blob file also gets overwritten (same path). If you need multiple decks per day, pass a custom `deckId`.

**`--no-persist` for development.** Add `--no-persist` when iterating on slide templates or QA logic. The runner still produces all outputs to `outputs/` but skips DB and Blob writes.

**Source window.** The default 90-day window covers the "past 12 months" deck scope with buffer. For the monthly horizon scan, 35–40 days is typically sufficient. Tune with `--days` or `--start`/`--end`.
