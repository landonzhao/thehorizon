# Layer 8 — QA

## Purpose

Final quality gate before the deck is distributed. Runs four deterministic check modules across the combined Layer 6 (synthesis) and Layer 7 (slides) output. All checks are deterministic — no LLM calls.

Layer 8 **reports** issues; it does not stop pipeline execution. Callers decide whether to block on errors, surface warnings, or pass the deck regardless.

---

## Entry Point

| File | Purpose |
|------|---------|
| `lib/pipeline/qa/qaLayer.js` | Main Layer 8 orchestrator |

```js
import { runQALayer, QA_VERSION } from "./lib/pipeline/qa/qaLayer.js";

const qaReport = runQALayer(deckResult, synthesisResult);
// deckResult     — output of runSlidesLayer()  (Layer 7)
// synthesisResult — output of runSynthesisLayer() (Layer 6)

if (!qaReport.overall_pass) {
  console.error("QA failed:", qaReport.summary.errors, "errors");
  for (const issue of qaReport.summary.all_issues.filter(i => i.severity === "error")) {
    console.error(" →", issue.message);
  }
}
```

**Input**: Layer 7 `deckResult` + Layer 6 `synthesisResult`.  
**Output**: `{ overall_pass, viewpoint_qa, slide_qa, citation_qa, number_qa, summary, qa_version }`.

`overall_pass` is `true` only when `summary.errors === 0`. Warnings do not affect the pass/fail gate.

---

## Check Modules

### Module 1 — Viewpoint QA (`qaViewpoints.js`)

Runs per viewpoint. Checks required fields, controlled-vocabulary values, length constraints, and that at least one `supporting_feed_evidence` ID resolves to a known source.

| Check | Severity | What it tests |
|-------|----------|--------------|
| `has_viewpoint_text` | error | `viewpoint` field is a non-empty string |
| `has_valid_category` | error | `category` is one of the six allowed values |
| `has_supporting_evidence` | error | `supporting_feed_evidence` array is non-empty |
| `has_valid_claim_type` | warning | `claim_type` ∈ `{trend, insight, early_signal, outlook, implication}` |
| `has_speaker_note` | warning | `speaker_note` field is non-empty |
| `has_valid_confidence` | warning | `confidence` ∈ `{high, medium, low}` |
| `has_valid_maturity` | warning | `maturity` ∈ `{research, emerging, growing, operational, mainstream}` |
| `has_valid_watch_window` | warning | `watch_window` ∈ `{now, 3_6_months, 6_12_months}` |
| `evidence_ids_resolvable` | warning | ≥1 ID in `supporting_feed_evidence` matches a known source |
| `viewpoint_not_too_long` | warning | Viewpoint text ≤ 60 words |
| `speaker_note_not_too_long` | info | Speaker note ≤ 120 words |

**Pass/fail logic**: a viewpoint fails if it has at least one `error`-level issue. Warnings and infos do not fail the viewpoint.

---

### Module 2 — Slide QA (`qaSlides.js`)

Runs per slide. Checks slide content structure.

| Check | Severity | What it tests |
|-------|----------|--------------|
| `has_headline` | error | `headline` field is a non-empty string |
| `bullet_count_ok` | error | ≤ 5 bullets |
| `bullets_not_too_long` | warning | Every bullet ≤ 15 words |
| `has_speaker_notes` | warning | `speaker_notes` field is non-empty |
| `has_evidence_or_viewpoint` | warning | Content slides have ≥1 evidence callout or ≥1 assigned viewpoint |

**Exempt slides** (skipped by `has_evidence_or_viewpoint`): slides 1 (title), 2 (overview), 3 (landscape), 10 (takeaways), 11 (appendix).

---

### Module 3 — Citation Validation (`validateCitations.js`)

Two sub-checks:

#### 3a. Per-slide structural integrity (`validateCitations`)

Runs on every content slide (excluding structural slides 1, 2, 3, 11):

| Check | Severity | What it tests |
|-------|----------|--------------|
| `callout_has_title` | warning | Every evidence callout has a non-empty `title` |
| `callout_has_publisher` | warning | Every evidence callout has a non-empty `publisher` |
| `callout_has_key_fact` | warning | Every evidence callout has a non-empty `key_fact` |
| `has_citations` | warning | Slide has ≥1 entry in `citations[]` |

#### 3b. High-priority source coverage (`checkCitationCoverage`)

Checks what fraction of `must_read` and `high` priority sources from Layer 6 appear in the deck's evidence plan (using `slide_plan[].evidence_used` source-ID lists for precise matching). Falls back to title matching when a plan is unavailable.

| Condition | Severity | What it flags |
|-----------|----------|--------------|
| `coverage_pct < 50%` and `high_priority > 0` | warning | Too few high-priority sources are cited in the deck |

**Coverage metric**: number of must_read/high sources whose ID appears in any slide's `evidence_used` list, divided by total must_read/high sources. Expressed as a percentage.

---

### Module 4 — Number and Phrase QA (`validateNumbers.js`)

Three sub-checks:

#### 4a. Number validation (`validateNumbers`)

Scans headlines, bullets, and speaker notes:

| Check | Severity | Condition |
|-------|----------|-----------|
| `invalid_percentage` | error | A percentage value > 100% |
| `implausible_year` | warning | A 4-digit year reference outside 2020–2030 |

#### 4b. Number consistency (`checkNumberConsistency`)

For each percentage statistic cited in headlines or bullets, searches the full source corpus (title + clean_text + `understanding.important_numbers` + `evidence_card.numbers_statistics`). If the exact number string is not found in the corpus:

| Check | Severity | Condition |
|-------|----------|-----------|
| `unverified_statistic` | warning | Percentage in slide text not traceable to any source |

This is a best-effort check. The LLM may have validly rephrased a source statistic (e.g. "~87%" from "87.3%"). Always verify flagged statistics manually before distribution.

#### 4c. Banned phrases (`checkBannedPhrases`)

Scans headline, bullets, and speaker notes for 27 filler and LLM-verbosity phrases:

| Check | Severity | Examples |
|-------|----------|---------|
| `banned_phrase` | warning | "it is important to note", "moving forward", "in conclusion", "at the end of the day", "plays a crucial role", "delve into", "dive into", etc. |

---

## Output

### `runQALayer` return value

```js
{
  overall_pass: boolean,    // true only when summary.errors === 0

  viewpoint_qa: {
    passed: number,
    failed: number,
    qa_issues: [{ viewpoint_id, check, severity, message }],
    viewpoint_results: [{ viewpoint_id, category, claim_type, checks: { [checkName]: boolean } }],
    overall_pass: boolean,
  },

  slide_qa: {
    passed: number,
    failed: number,
    qa_issues: [{ slide_number, slide_title, check, message }],
    slide_results: [{ slide_number, slide_title, checks: { [checkName]: boolean } }],
    overall_pass: boolean,
  },

  citation_qa: {
    high_priority: number,   // must_read + high sources
    covered:       number,   // sources appearing in the deck plan
    coverage_pct:  number,   // covered / high_priority * 100
    issues: [{ check, severity, message, ...slide_number? }],
  },

  number_qa: {
    issues: [{ slide_number, check, severity, message, field?, phrase?, number? }],
  },

  summary: {
    total_issues: number,
    errors:       number,    // blocks overall_pass
    warnings:     number,    // advisory; does not block
    infos:        number,    // informational only
    all_issues: [            // flat list of all issues with module tag
      { module: "viewpoints"|"slides"|"citations"|"numbers", ...issue }
    ],
  },

  qa_version: "qa-v8.0",
}
```

---

## Severity Levels

| Severity | Meaning | Blocks `overall_pass` |
|----------|---------|----------------------|
| `error` | Structural problem that must be fixed before distribution | Yes |
| `warning` | Quality issue that should be reviewed before distribution | No |
| `info` | Advisory note — no action required | No |

---

## Tooling Notes

**Fully deterministic — no LLM.** All checks run in < 10 ms regardless of deck size. This makes Layer 8 safe to run in a CI/CD pipeline or as an automated pre-distribution gate.

**Layer 8 does not mutate.** It only reads the Layer 6 and Layer 7 outputs; it never modifies slides or viewpoints. Fix issues by re-running the upstream layer.

**Warnings are common and expected.** LLM-generated content will almost always trigger at least one banned-phrase warning or unverified-statistic warning. These are advisory — review them manually, but don't treat every warning as a blocker.

**Error threshold for distribution**: `summary.errors === 0`. A deck with only warnings and infos is structurally sound and can be distributed. A deck with errors has one or more slides missing a headline, having too many bullets, or referencing no evidence — these are visible quality failures.

**Adding new checks**: add a new entry to `CHECKS` in the relevant module. The check function receives the item being checked plus any context passed by the orchestrator. Add it to `CHECKS` and assign a `severity`.
