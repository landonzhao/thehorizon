# Layer 9 — QA

**File:** `lib/pipeline/qa/qaLayer.js`
**No LLM calls.** Fully deterministic.

---

## Purpose

Final quality gate before deck delivery. Runs four deterministic check modules over the completed slide deck and returns a structured QA report. `overall_pass` is `true` only when there are zero errors (warnings are acceptable).

---

## Modules

```
deckResult + synthesisResult
    │
    ▼
Module 1: qaViewpoints()              — no-op (backward compat)
    │
    ▼
Module 2: qaSlides()                  — per-slide structural checks
    │
    ▼
Module 3: validateCitations()         — callout field integrity
          checkCitationCoverage()     — high-priority source coverage
    │
    ▼
Module 4: validateNumbers()           — percentage ranges, year plausibility
          checkNumberConsistency()    — statistics traced to sources
          checkBannedPhrases()        — filler language detection
    │
    ▼
QAResult
```

---

## Module 1 — Viewpoint QA

**File:** `lib/pipeline/qa/qaViewpoints.js`

No-op. Viewpoints have been replaced by `category_analyses` in Layer 8. This module returns empty results for backward compatibility. Always passes.

---

## Module 2 — Slide QA

**File:** `lib/pipeline/qa/qaSlides.js`

Runs per-slide structural checks. Structural slide types (`title`, `section_divider`, `appendix`) are exempt from evidence-related checks.

### Checks

| Check | Severity | Condition |
|-------|----------|-----------|
| `has_headline` | error | `slide.headline` is empty or missing |
| `bullet_count_ok` | error | `slide.bullets.length > 5` |
| `bullets_not_too_long` | warning | any bullet > 15 words |
| `has_speaker_notes` | warning | `slide.speaker_notes` is empty |
| `has_evidence_or_citations` | warning | content slide with no evidence callouts AND no citations |
| `callouts_have_evidence_id` | warning | any callout missing a non-empty `evidence_id` |

### Output

```js
{
  passed: number,         // slides with zero errors
  failed: number,         // slides with at least one error
  overall_pass: boolean,  // true only if failed === 0
  qa_issues: [
    { slide_number, slide_type, check, severity, message }
  ],
}
```

---

## Module 3 — Citation Validation

**File:** `lib/pipeline/qa/validateCitations.js`

Two checks: per-callout field integrity and high-priority source coverage across the deck.

### validateCitations — Field Integrity

Checks every evidence callout in every slide has required fields. Structural types (`title`, `section_divider`, `appendix`, `conclusion`) are exempt.

| Check | Severity | Condition |
|-------|----------|-----------|
| `citation_missing_title` | warning | callout has no `title` |
| `citation_missing_publisher` | warning | callout has no `publisher` |
| `citation_missing_key_fact` | error | callout has no `key_fact` |
| `callout_missing_evidence_id` | warning | callout has no `evidence_id` |

### checkCitationCoverage — Source Coverage

Checks what fraction of `must_read` and `high` priority sources from the dossier appear in the deck's evidence callouts.

Matching: a source `s` is considered covered if any slide has a callout with `evidence_id === "raw_" + s.id`.

| Field | Description |
|-------|-------------|
| `high_priority` | Total must_read + high sources |
| `covered` | Count appearing in at least one callout |
| `coverage_pct` | `covered / high_priority × 100` |

Coverage below 50% produces a `warning`. Decks with zero high-priority sources always pass.

### Combined Output

```js
{
  high_priority: number,
  covered: number,
  coverage_pct: number,
  issues: [{ slide_number, check, severity, message }],
}
```

---

## Module 4 — Number and Phrase QA

**File:** `lib/pipeline/qa/validateNumbers.js`

Three checks: range validation, consistency, and banned filler phrases.

### validateNumbers — Range Checks

Checks all text in slide headlines, bullets, and evidence callout key_facts.

| Check | Severity | Condition |
|-------|----------|-----------|
| `percentage_out_of_range` | error | Percentage value outside 0–100 |
| `implausible_year` | warning | Year reference < 2018 or > current year + 2 |

### checkNumberConsistency — Source Tracing

For each statistic in a slide's evidence callouts (`numbers_statistics` field of the evidence source), verifies the number appears somewhere in the source's `clean_text` or `full_text`. Mismatches produce a warning. Requires access to `feed_sources[]` from `synthesisResult`.

| Check | Severity | Condition |
|-------|----------|-----------|
| `number_not_in_source` | warning | Statistic in callout not found in source text |

### checkBannedPhrases — Filler Detection

Scans all slide text (headline, bullets, speaker_notes) for generic filler language that should not appear in a professional intelligence briefing.

Banned patterns include:
- "it is important to note"
- "going forward"
- "in conclusion"
- "as we can see"
- "it is worth noting"
- "needless to say"
- "in today's world"
- "in the current landscape"

| Check | Severity | Condition |
|-------|----------|-----------|
| `banned_phrase` | warning | Any banned pattern found in slide text |

### Combined Output

```js
{
  issues: [{ slide_number, field, check, severity, message, value? }],
}
```

---

## QA Result

```js
{
  overall_pass: boolean,   // true only when errors === 0

  viewpoint_qa: { passed, failed, qa_issues, overall_pass },
  slide_qa:     { passed, failed, qa_issues, overall_pass },
  citation_qa:  { high_priority, covered, coverage_pct, issues },
  number_qa:    { issues },

  summary: {
    total_issues: number,
    errors:       number,
    warnings:     number,
    infos:        number,
    all_issues:   [{ module, check, severity, message, ... }],
  },

  qa_version: "qa-v8.0",
}
```

The QA report is written to `outputs/final/slide_qa_report.json` by `pipelineRunner.js` after `runQALayer()` completes.
