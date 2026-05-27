# Layer 7 — Slides

## Purpose

Produce the final presentation deck from Layer 6 synthesis output. Layer 7 has four steps:
planning (deterministic), content generation (LLM), optional speaker note expansion (LLM), and export (deterministic routing).

---

## Entry Point

| File | Purpose |
|------|---------|
| `lib/pipeline/slides/slidesLayer.js` | Main Layer 7 orchestrator |

```js
import { runSlidesLayer, DECK_VERSION } from "./lib/pipeline/slides/slidesLayer.js";

const { slide_plan, slides, exports, counts } = await runSlidesLayer(synthesisResult, {
  exportFormat:  "all",       // "markdown" | "speaker_script" | "pptx" | "json" | "all"
  outputPath:    "/tmp/deck.pptx",  // required for PPTX
  detailedNotes: true,        // optional second LLM pass for expanded speaker notes
});
```

**Input**: Layer 6 `synthesisResult` — `{ feed_sources, analytics, viewpoints }`.  
**Output**: `{ slide_plan, slides, exports, counts, deck_version }`.

---

## Step 1 — Slide Planning (`planSlides.js`)

Deterministic. Maps viewpoints, evidence, and analytics into a fixed 11-slide deck structure.

### Deck Structure

| # | Slide | Category | Content assigned |
|---|-------|----------|-----------------|
| 1 | Title | — | Static (no dynamic content) |
| 2 | Executive Overview | — | Category counts, total sources, high-confidence viewpoints |
| 3 | Threat Landscape Overview | — | `category_distribution`, `source_type_distribution`, `timeline` visualizations |
| 4 | Traditional AI Threats | `traditional_ai_threats` | Viewpoints + top-scored sources for this category |
| 5 | LLM Threats | `llm_threats` | Viewpoints + top-scored sources |
| 6 | Agentic AI Threats | `agentic_ai_threats` | Viewpoints + top-scored sources |
| 7 | AI-Enabled Threats | `ai_enabled_threats` | Viewpoints + top-scored sources |
| 8 | Cross-Category Convergence | `cross_category` | Cross-category viewpoints + `attack_surface_heatmap`, `signal_cluster_radar` |
| 9 | Six-Month Outlook | — | Viewpoints with `watch_window: "3_6_months"` or `"6_12_months"` |
| 10 | Key Takeaways | — | Top 3 `confidence: "high"` viewpoints |
| 11 | Appendix: Sources | — | Static citation list |

### Per-slide assignment

For each slide, `planSlides` assigns:
- `viewpoints_used` — viewpoint IDs whose `category` matches the slide (or special logic for slides 8–10)
- `evidence_used` — source IDs from the matched viewpoints' `supporting_feed_evidence`, plus top-scored category sources (feed_score ≥ 60), capped at 5 per slide
- `analytics_used` — analytics hints (counts, distributions) as string annotations
- `visualization_used` — viz spec IDs (from `viz_ids` in the slide definition, filtered to only those that exist in `visualization_specs`)

---

## Step 2 — Slide Content Generation (`generateSlideContent.js`)

LLM-powered. Runs one LLM call per slide (except slides 1 and 11 which are built deterministically).

### Output per slide

| Field | Content |
|-------|---------|
| `slide_title` | As planned |
| `headline` | Single strategic insight statement (≤20 words) |
| `bullets` | 3–5 distinct claims/facts (≤15 words each) |
| `visualization` | `{ viz_id, caption }` if a visualization fits, else `null` |
| `evidence_callouts` | 1–3 `{ title, key_fact, publisher }` records from assigned evidence |
| `speaker_notes` | 3–5 sentence inline notes explaining significance and strategic implication |
| `citations` | Publisher + title strings for all evidence referenced |

### LLM inputs per call

The user prompt for each slide includes:
1. Slide number, title, purpose, and core message
2. Viewpoint details (viewpoint text + speaker note from Layer 6)
3. Evidence details (title, publisher, date, source summary, key facts from Layer 6 evidence cards)
4. Analytics hints (source counts, distributions)
5. Preferred visualization ID (if any)

### Deterministic fallbacks (no LLM)

- **Slides 1 and 11**: Always built deterministically (title slide and appendix).
- **All other slides when LLM unavailable**: `mockSlideContent()` uses viewpoint `viewpoint` text (truncated to 12 words) as bullets and evidence `title` fields as callouts.

### LLM prompt design

```
You are creating content for a professional AI cybersecurity threat horizon scan presentation.
Style: concise, strategic, evidence-backed. Suitable for government and conference briefings.

headline — strategic INSIGHT or CLAIM (not a description of the slide)
bullets — 3–5 points, max 15 words each, each a distinct claim
evidence_callouts — key_fact must be a SPECIFIC fact from that source
speaker_notes — WHY this matters, not WHAT it says; reference evidence by publisher/CVE
```

---

## Step 3 — Speaker Notes Expansion (`generateSpeakerNotes.js`) *(optional)*

LLM-powered. Only runs when `opts.detailedNotes = true`. One LLM call per non-structural slide (slides 2–10 = 9 calls).

Replaces the brief 3–5 sentence inline `speaker_notes` with a full 5–8 sentence talking script:
- Opens by explaining the headline in plain language
- Adds context the bullets don't cover
- References specific evidence by publisher name, CVE ID, or statistic
- States the strategic implication: "What this means for defenders is…"
- Ends with a natural transition or "so what"

**When to use**: high-stakes briefings requiring a polished verbatim script for less-experienced presenters. Not needed when presenters can speak from bullets.

### LLM prompt

```
Write 5–8 sentences of natural spoken presenter notes.
Write as if speaking directly to the audience — conversational but authoritative.
Explain the headline in plain terms, add depth, reference evidence by name,
state the strategic implication, end with a bridging sentence.
Return plain text only — no JSON, no markdown.
```

---

## Step 4 — Export (`exportDeck.js`)

Deterministic routing to the requested output format.

| `exportFormat` | Output key | Implementation |
|---------------|-----------|----------------|
| `"markdown"` | `exports.markdown` | Full Markdown deck with headlines, bullets, evidence callouts, speaker notes |
| `"speaker_script"` | `exports.speaker_script` | Standalone Markdown speaker script (notes + talking points per slide) |
| `"pptx"` | `exports.pptx_path` | Styled PowerPoint via `pptxgenjs`; requires `outputPath` |
| `"json"` | `exports.json` | Raw slide objects (passthrough) |
| `"all"` | All of the above | markdown + speaker_script + json + pptx (if `outputPath` given) |

### PPTX slide types

`exportPptx.js` maps slide titles to specific layout builders:

| Slide | Builder |
|-------|---------|
| Title (slide 1) | `buildTitleSlide` — full-bleed title with date |
| Executive Overview | `buildOverviewSlide` — analytics stats overlay |
| Threat Landscape | `buildLandscapeSlide` — visualization embed |
| Category deep-dives | `buildSectionDivider` + `buildContentSlide` — category-branded |
| Cross-category convergence | `buildSectionDivider` (cross) + `buildContentSlide` |
| Outlook | `buildOutlookSlide` — watch-window timeline |
| Key Takeaways | `buildTakeawaysSlide` — numbered recommendations |
| Appendix | `buildAppendixSlide` — source citation list |

---

## Output

### `runSlidesLayer` return value

```js
{
  slide_plan: [
    {
      slide_number: number,
      slide_title: string,
      slide_purpose: string,
      core_message: string,
      viewpoints_used: string[],     // viewpoint_id list
      evidence_used: string[],       // source id list (up to 5)
      analytics_used: string[],      // analytics hint strings
      visualization_used: string[],  // viz_id list
      speaker_script_goal: string,
    }
  ],

  slides: [
    {
      slide_number: number,
      slide_title: string,
      headline: string,
      bullets: string[],
      visualization: { viz_id: string, caption: string } | null,
      evidence_callouts: [{ title, key_fact, publisher }],
      speaker_notes: string,
      citations: string[],
    }
  ],

  exports: {
    markdown?:       string,   // full deck markdown
    speaker_script?: string,   // standalone speaker script markdown
    json?:           object[], // raw slide objects
    pptx_path?:      string,   // absolute path to .pptx file
  },

  counts: {
    slides_planned:      number,
    slides_generated:    number,
    evidence_cards_used: number,  // unique source IDs across all slide plans
  },

  deck_version: "deck-v7.0",
}
```

---

## Tooling Notes

**LLM cost.** One LLM call per substantive slide = 9 calls (slides 2–10). At ~1500 tokens each, total ≈ 13 500 tokens per deck run. At gpt-4o-mini pricing ≈ $0.002/deck. With `detailedNotes: true`, add 9 more calls ≈ $0.004/deck.

**Slides are generated sequentially.** Each slide's user prompt is self-contained, so calls could be parallelized. They are currently sequential to stay within rate limits and keep the implementation simple. Parallelise if latency becomes a concern.

**Deterministic plan is stable across re-runs.** `planSlides` produces the same 11-slide structure every time for the same viewpoints/evidence input. Only the LLM content changes between runs.

**PPTX requires `pptxgenjs`.** Install: `npm install pptxgenjs`. The export will fail at runtime if the package is not installed, but all other formats (`markdown`, `json`, `speaker_script`) work without it.

**`detailedNotes` doubles the LLM cost for speaker script quality.** Only enable it when preparing a printed script for a live briefing. Inline notes from Step 2 are sufficient for most slide decks.
