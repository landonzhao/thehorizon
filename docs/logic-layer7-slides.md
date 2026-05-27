# Layer 7 — Slides

**Orchestrator:** `lib/pipeline/slides/slidesLayer.js`
**LLM calls:** Step 2 (slide content) and Step 3 (speaker notes). Steps 1 and 4 are fully deterministic.

---

## Purpose

Produce the final presentation deck from the synthesis result. Four steps: plan the deck structure, generate LLM content per slide, generate speaker notes, then export to PPTX/JSON/Markdown.

---

## Pipeline Steps

```
synthesisResult (from runSynthesisLayer)
    │
    ▼
Step 1: planSlides()                  — deterministic deck structure
    │
    ▼
Step 2: generateSlideContent()        — LLM content per content slide
    │
    ▼
Step 3: generateSpeakerNotesForDeck() — LLM notes per slide (AFTER Step 2)
    │
    ▼
Step 4: exportDeck()                  — write PPTX, JSON, Markdown
```

**Critical constraint:** Step 3 MUST run after Step 2. Speaker notes use finalized slide content only; no new claims may be introduced.

---

## Step 1 — Deck Planner

**File:** `lib/pipeline/slides/planSlides.js`
**No LLM calls.** Fully deterministic.

Builds a dynamic slide plan from Layer 8 (analysis) outputs. Slide count is driven by active categories (categories with at least one source).

### Deck Structure

For N active categories:

| Slide | Type | Description |
|-------|------|-------------|
| 1 | `title` | Title slide |
| 2 | `executive_overview` | Top insight per category + source stats |
| 3 | `threat_landscape` | Overall landscape with analytics |
| 4, 6, 8, ... | `section_divider` | Category section header (one per category) |
| 5, 7, 9, ... | `category_content` | Category analysis slide (one per category) |
| 3+2N+1 | `cross_category` | Cross-category convergence |
| 3+2N+2 | `outlook` | 6-month outlook + early signals |
| 3+2N+3 | `conclusion` | Key takeaways |
| 3+2N+4 | `appendix` | Sources and citations |

Total: 9 slides for 1 active category, up to 3+2N+5 for N categories.

### Planned Slide Fields

Each planned slide has:
- `slide_number` — integer, 1-based
- `slide_type` — one of the types above
- `title` — slide title string
- `rawfact_evidence[]` — top items from the category dossier (must_read/high priority)
- `analytics_evidence[]` — category-specific analytics items
- `visualization_ids[]` — refs to specs from `visualizationSpecs.js`
- `speaker_note_intent` — plain-English description of what to convey
- `category` — category key (for `category_content` slides only)
- `core_message` — one-sentence instruction for the LLM content generator

---

## Step 2 — Slide Content Generation

**File:** `lib/pipeline/slides/generateSlideContent.js`
**LLM call:** Yes — one call per content slide (with deterministic fallback).

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |
| **GROQ NOT USED** | Evidence callout evidence_ids require strict `json_schema`; Groq supports JSON mode only |
| Output format | Structured JSON via `SLIDE_CONTENT_SCHEMA` |
| Label | `"Layer7-slide<N>-<type>"` |
| Concurrency | 3 parallel calls |
| Trigger | Any OPENAI or GEMINI key AND `slide_type NOT IN (title, section_divider, appendix)` |
| Fallback | `deterministicSlide()` — title + plan bullets + top evidence items |

### System Prompt

```
You are generating content for a professional AI cybersecurity threat horizon scan briefing deck.

Style: concise, strategic, evidence-backed. Suitable for government and conference presentations.
Audience: cybersecurity executives, policy analysts, technical leads.

## FIELD REQUIREMENTS

title — return the provided slide title exactly.

headline — ONE strategic claim (≤20 words). Not a description — an insight.
  Good: "Prompt injection has moved from research to operational exploitation in 12 months."
  Bad: "This slide covers prompt injection."

bullets — 3–5 points (max 15 words each). Each must be a distinct, evidence-backed claim.
  No bullet repeats the headline. No filler.

evidence_callouts — 1–3 callouts. Each MUST trace to an evidence item from the dossier.
  evidence_id: copy EXACTLY from the rawfact_evidence items provided.
  key_fact: a SPECIFIC fact from that source (a number, name, or concrete claim from the evidence).
  title, publisher, url: copy from the evidence item.
  DO NOT invent facts. Only use what is in the evidence.

citations — one string per cited source: "Publisher — Title (URL)"

## ABSOLUTE RULES
- Do not speculate or invent facts not in the provided analysis/evidence
- Every evidence callout must reference an evidence_id from the dossier
- Bullets max 5, max 15 words each
- Return strict JSON only — no markdown, no preamble
```

### User Prompt — Category Content Slides

Built by `buildCategoryPrompt(slidePlan)`:

```
SLIDE TITLE: <title>
CATEGORY: <CATEGORY LABEL>
CORE MESSAGE: <core_message>
AVAILABLE VISUALIZATIONS: <visualization_ids, comma-separated>

CATEGORY ANALYSIS:
Overview: <analysis.overview>
Top Insights:
  [high] <insight> (evidence: <ids>)
  ...
Early Signals:
  <signal> → <implication>
Outlook: <statement>

RAWFACT EVIDENCE (use evidence_id in callouts):
[<evidence_id>] <title>
  publisher=<publisher>  date=<date>  score=<score>  priority=<priority>
  summary: <short_summary>
  key facts: <key_facts>
  stats: <numbers_statistics>
  ...

ANALYTICS EVIDENCE (cite analytics_id to reference):
[<analytics_id>] <metric_name>: { <top entries> }

Generate slide content. Every evidence callout MUST use an evidence_id from the dossier above.
```

### User Prompt — Cross-Category, Outlook, Conclusion, Executive Slides

Built by `buildCrossOrOutlookPrompt(slidePlan)`:

```
SLIDE TITLE: <title>
CORE MESSAGE: <core_message>
AVAILABLE VISUALIZATIONS: <visualization_ids>

[for cross_category slides:]
CROSS-CATEGORY INSIGHTS:
  [<category>] <signal/insight> → <implication>
TOP SIGNAL CLUSTERS: <top 5 clusters with counts>
TOP RECURRING THEMES: <top 5 themes with counts>

[for outlook slides:]
CATEGORY OUTLOOKS:
  [<Category Label>] <outlook statement>
EARLY SIGNALS:
  [<Category Label>] <signal> → <implication>

[for conclusion slides:]
HIGH-CONFIDENCE INSIGHTS ACROSS CATEGORIES:
  [<Category Label>] <insight>

[for exec_overview slides:]
TOP INSIGHT PER CATEGORY:
  [<Category Label>] <insight>
TOTAL SOURCES: <count>
CATEGORY COUNTS: <JSON>
TOP ATTACK VECTORS: <comma-separated>

Generate slide content. Note: for cross-category/outlook/overview slides, evidence_callouts may be empty array [] if no specific rawfact items are available.
```

### Output Schema (`SLIDE_CONTENT_SCHEMA`)

```json
{
  "title": "string",
  "headline": "string (≤20 words)",
  "bullets": ["string (≤15 words each)"],
  "evidence_callouts": [
    {
      "evidence_id": "raw_<source_id>",
      "title": "string",
      "publisher": "string",
      "url": "string",
      "key_fact": "string"
    }
  ],
  "citations": ["Publisher — Title (URL)"],
  "visualization_ids": ["string"]
}
```

### Deterministic Fallback

```js
deterministicSlide(slidePlan) {
  title: slidePlan.title
  headline: slidePlan.core_message || category analysis overview
  bullets: top 3 insights from category analysis
  evidence_callouts: top rawfact evidence items, up to 2
  citations: []
}
```

---

## Step 3 — Speaker Notes

**File:** `lib/pipeline/slides/generateSpeakerNotes.js`
**LLM call:** Yes — one call per content slide (with deterministic fallback).

MUST run AFTER Step 2. Uses finalized slide content only. No new claims may be introduced.

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |
| Output format | Plain text (`parseJson: false`) |
| Label | `"Layer7-notes-<slide_number>"` |
| Concurrency | 3 parallel calls |
| Trigger | Any OPENAI or GEMINI key AND `slide_type NOT IN (title, appendix)` |
| Structural slides | `title` and `appendix` use `speaker_note_intent` directly, no LLM |

### System Prompt

```
You are a senior cybersecurity intelligence analyst writing a presenter script for one slide in a strategic AI threat horizon scan briefing.

Audience: cybersecurity executives, policy analysts, and technical leads.

## TASK
Write 5–8 sentences of natural spoken presenter notes.

## REQUIREMENTS
- Write as if speaking aloud — conversational but authoritative
- Start with the headline in plain terms
- Add depth bullets don't cover: context, backstory, analyst judgment
- Reference specific evidence by publisher, statistic, or CVE where present
- State strategic implication: "What this means for defenders is..."
- Include one concrete recommendation or call-to-action where evidence supports it
- End with a bridging sentence or clear "so what"
- DO NOT introduce any claim not present in the provided slide content
- DO NOT invent facts, numbers, or sources

Return plain text only — a single paragraph. No JSON, no markdown.
```

### User Prompt

Built by `buildPrompt(slide)`:

```
SLIDE <slide_number>: <title>
TYPE: <slide_type>
HEADLINE: <headline>

BULLETS:
- <bullet>
- <bullet>
...

EVIDENCE CALLOUTS:
• <publisher>: <key_fact>
• ...

CITATIONS:
<citation 1>
<citation 2>
<citation 3>  (max 3)

INTENT (what this slide should accomplish):
<speaker_note_intent>

Write the presenter script paragraph (5–8 sentences). Do not add claims not in the slide content above.
```

### Output

Plain text string — a single paragraph of 5–8 spoken sentences.

### Deterministic Fallback

```js
deterministicNotes(slide) {
  return [
    slide.headline || slide.title,
    "Key points: " + slide.bullets.slice(0, 3).join("; "),  // if bullets exist
    ev.publisher + " reports: " + ev.key_fact,              // if evidence_callouts
    slide.speaker_note_intent,                              // if set
  ].join(" ")
}
```

---

## Step 4 — Deck Export

**File:** `lib/pipeline/slides/exportDeck.js` → `exportPptx.js`, `exportMarkdownDeck.js`
**No LLM calls.** Fully deterministic.

### Formats

| Format | Description | File |
|--------|-------------|------|
| `pptx` | Styled PowerPoint via PptxGenJS | `outputs/final/horizon_scan_deck.pptx` |
| `json` | Raw slide objects | `outputs/final/slide_deck_output.json` |
| `speaker_script` | Speaker notes Markdown | `outputs/final/speaker_script.md` |
| `markdown` | Full deck Markdown | (in-memory only, returned in result) |
| `all` | All of the above | |

### PPTX Template

Template: `templates/AI x Security (for AISP projection) (1).pptx`
Profile: `templates/template_profile.json` (extracted by `profileTemplate.js`)

**CSA Colour Palette:**
| Accent | Hex | Use |
|--------|-----|-----|
| accent1 | `3583C9` | Primary blue, section bars |
| accent2 | `9C62A7` | Purple |
| accent3 | `19BC9D` | Teal |
| accent4 | `FFAA22` | Amber, highlights |
| accent5 | `004987` | Navy, title backgrounds |
| accent6 | `CC0033` | Red, warnings |

**Fonts:** Calibri Light (headings), Calibri (body), Segoe UI (title slide)
**Canvas:** 13.33 × 7.5 inches (widescreen 16:9)

### Visualizations in PPTX

Slides with assigned `visualization_ids` have charts rendered as native PptxGenJS shapes via `renderVisualization.js`. No image embedding. Supported: `bar_chart`, `stacked_bar`, `heatmap`, `radar_chart`, `matrix`, `timeline`.

---

## Layer Output

```js
{
  slide_plan: object[],     // planned slides from Step 1
  slides: object[],         // finalized slides with content + speaker notes
  exports: {
    markdown?: string,
    speaker_script?: string,
    pptx?: { path, slide_count },
    json?: object[],
  },
  counts: {
    evidence_callouts_used: number,  // total evidence callouts across all slides
  },
  deck_version: "deck-v7.1",
}
```
