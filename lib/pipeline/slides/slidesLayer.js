/**
 * Layer 7 — Slides Orchestrator
 *
 * Produces the final presentation deck from runSynthesisLayer() output.
 * Contains no direct LLM calls — all LLM calls are delegated to
 * generateSlideContent.js (Step 2) and generateSpeakerNotes.js (Step 3).
 *
 * ── PIPELINE STEPS ────────────────────────────────────────────────────────────
 * Step 1 — planSlides() — deterministic, no LLM
 *   Maps category_analyses + dossiers + analytics into a dynamic deck structure.
 *   Slide count driven by active categories (9 slides minimum for 1 category,
 *   up to 3+2N+5 for N categories). Each slide assigned evidence + viz refs.
 *
 * Step 2 — generateSlideContent() — LLM (structural slides deterministic)
 *   Tool:    callLLM() via generateSlideContent.js
 *   Keys:    OPENAI_API_KEY, OPENAI_API_KEY_2, GEMINI_API_KEY, GEMINI_API_KEY_2
 *            (GROQ not used — citation-traced structured output requires schema)
 *   Trigger: any OPENAI or GEMINI key AND slide_type NOT IN (title, section_divider, appendix)
 *   Output:  structured JSON per slide: title, headline, bullets[], evidence_callouts[],
 *            citations[], visualization_ids[]
 *            evidence_callouts MUST include evidence_id copied exactly from rawfact dossier
 *   Schema:  SLIDE_CONTENT_SCHEMA (in generateSlideContent.js)
 *   Label:   "Layer7-slide<N>-<type>", concurrency: 3
 *   Fallback: deterministicSlide() — title + plan bullets + top evidence items
 *
 * Step 3 — generateSpeakerNotesForDeck() — LLM (always runs, deterministic fallback)
 *   MUST run AFTER Step 2 — uses finalized slide content only, no new claims.
 *   Tool:    callLLM() via generateSpeakerNotes.js
 *   Keys:    OPENAI_API_KEY, OPENAI_API_KEY_2, GEMINI_API_KEY, GEMINI_API_KEY_2
 *   Trigger: any OPENAI or GEMINI key AND slide_type NOT IN (title, appendix)
 *   Output:  plain text paragraph (parseJson: false), 5–8 sentences
 *   Label:   "Layer7-notes-<slide_number>", concurrency: 3
 *   Fallback: deterministicNotes() — headline + key bullets + first evidence item
 *
 * Step 4 — exportDeck() + file writes — deterministic, no LLM
 *   Writes to outputs/final/:
 *     horizon_scan_deck.pptx    (via exportPptx.js → PptxGenJS)
 *     slide_deck_output.json    (raw slide objects)
 *     speaker_script.md         (via exportMarkdownDeck.exportSpeakerScript)
 *
 * ── INPUT ────────────────────────────────────────────────────────────────────
 * synthesisResult from runSynthesisLayer():
 *   { feed_sources[], analytics: { aggregates, visualization_specs },
 *     category_analyses[], dossiers[] }
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * { slide_plan, slides[], exports, counts: { evidence_callouts_used }, deck_version }
 */

import { join, resolve }                   from "path";
import { mkdir, writeFile }                 from "fs/promises";
import { fileURLToPath }                    from "url";
import { dirname }                          from "path";

import { planSlides }                       from "./planSlides.js";
import { generateSlideContent }             from "./generateSlideContent.js";
import { generateSpeakerNotesForDeck }      from "./generateSpeakerNotes.js";
import { exportDeck }                       from "./exportDeck.js";
import { exportMarkdownDeck, exportSpeakerScript } from "./exportMarkdownDeck.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

export const DECK_VERSION = "deck-v7.1";

// ── Output path helpers ────────────────────────────────────────────────────────

async function ensureOutputDir(dir) {
  await mkdir(dir, { recursive: true });
}

function outputsDir() {
  return join(PROJECT_ROOT, "outputs", "final");
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Run the full Layer 7 slides pipeline.
 *
 * @param {object} synthesisResult  - Output of runSynthesisLayer() (Layers 6+8).
 *   Required fields: feed_sources, analytics, category_analyses, dossiers
 * @param {object} [opts]
 * @param {boolean} [opts.skipLlm=false]
 *   Skip all LLM calls; use deterministic fallback for slide content.
 * @param {boolean} [opts.detailedNotes=true]
 *   Run the speaker notes pass. Defaults true (always generate notes for final deck).
 *   Pass false to skip for speed during testing.
 * @param {string}  [opts.exportFormat="all"]
 *   "markdown" | "speaker_script" | "pptx" | "json" | "all"
 * @param {string}  [opts.outputPath=null]
 *   Override for PPTX output path. Defaults to outputs/final/horizon_scan_deck.pptx.
 * @returns {Promise<DeckResult>}
 */
export async function runSlidesLayer(synthesisResult, opts = {}) {
  const {
    skipLlm       = false,
    detailedNotes = true,
    exportFormat  = "all",
    outputPath    = null,
  } = opts;

  const {
    feed_sources    = [],
    analytics       = {},
    category_analyses = [],
    dossiers        = [],
  } = synthesisResult;

  const { aggregates = {}, visualization_specs = [] } = analytics;

  if (!feed_sources?.length) {
    return {
      slide_plan:   [],
      slides:       [],
      exports:      {},
      counts:       { slides_planned: 0, slides_generated: 0, evidence_callouts_used: 0 },
      deck_version: DECK_VERSION,
    };
  }

  // ── Step 1: Slide planning ────────────────────────────────────────────────
  process.stdout.write("  [Layer 7] Step 1 — Planning slide deck...\n");
  const slide_plan = planSlides(
    category_analyses,
    dossiers,
    feed_sources,
    aggregates,
    visualization_specs
  );
  process.stdout.write(`    ${slide_plan.length} slides planned\n`);

  // ── Step 2: Slide content generation ─────────────────────────────────────
  process.stdout.write(`  [Layer 7] Step 2 — Generating slide content (skipLlm=${skipLlm})...\n`);
  const contentSlides = await generateSlideContent(slide_plan, feed_sources, { skipLlm });
  process.stdout.write(`    ${contentSlides.length} slides generated\n`);

  // ── Step 3: Speaker notes (separate pass, AFTER content is finalized) ────
  // Always runs — deterministic fallback available when skipLlm=true.
  // Speaker notes are generated from finalized slide content only; no new claims.
  process.stdout.write("  [Layer 7] Step 3 — Generating speaker notes...\n");
  const finalSlides = await generateSpeakerNotesForDeck(contentSlides, { skipLlm });
  process.stdout.write("    Speaker notes complete\n");

  // ── Step 4: Export ────────────────────────────────────────────────────────
  process.stdout.write("  [Layer 7] Step 4 — Exporting deck...\n");

  const outDir   = outputsDir();
  const pptxPath = outputPath || join(outDir, "horizon_scan_deck.pptx");

  await ensureOutputDir(outDir);

  const exports = await exportDeck(finalSlides, exportFormat, {
    feedSources:        feed_sources,
    aggregates,
    visualizationSpecs: visualization_specs,
    outputPath:         pptxPath,
  });

  // Always write JSON and speaker script to outputs/final/ regardless of exportFormat
  const jsonPath   = join(outDir, "slide_deck_output.json");
  const scriptPath = join(outDir, "speaker_script.md");

  await writeFile(jsonPath,   JSON.stringify(finalSlides, null, 2));
  await writeFile(scriptPath, exportSpeakerScript(finalSlides));

  process.stdout.write(
    `    Exports: pptx=${pptxPath}\n` +
    `             json=${jsonPath}\n` +
    `             script=${scriptPath}\n`
  );

  // ── Counts ────────────────────────────────────────────────────────────────
  const evidenceCalloutsUsed = finalSlides.reduce(
    (n, s) => n + (s.evidence_callouts?.length || 0),
    0
  );

  return {
    slide_plan,
    slides: finalSlides,
    exports: {
      ...exports,
      json_path:    jsonPath,
      script_path:  scriptPath,
      pptx_path:    pptxPath,
    },
    counts: {
      slides_planned:         slide_plan.length,
      slides_generated:       finalSlides.length,
      evidence_callouts_used: evidenceCalloutsUsed,
    },
    deck_version: DECK_VERSION,
  };
}
