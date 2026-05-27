/**
 * Layer 7 — Deck Export
 *
 * Fully deterministic — no LLM calls. Routes a finalized slide deck to one or
 * more output formats. Called by slidesLayer.js after speaker notes are generated.
 *
 * ── SUPPORTED FORMATS ────────────────────────────────────────────────────────
 * "markdown"       — human-readable Markdown deck (exportMarkdownDeck)
 * "speaker_script" — full speaker script with notes (exportSpeakerScript)
 * "pptx"           — styled PowerPoint written to outputPath (exportPptx)
 * "json"           — raw slide objects (passthrough, no transformation)
 * "all"            — markdown + speaker_script + json, + pptx if outputPath provided
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * Returns: { markdown?, speaker_script?, pptx?: { path, slide_count }, json? }
 * Only keys for requested formats are present.
 */

import { exportMarkdownDeck, exportSpeakerScript } from "./exportMarkdownDeck.js";
import { exportPptx } from "./exportPptx.js";

/**
 * Export a slide deck to one or more formats.
 *
 * @param {object[]} slides  - Generated slide content objects from generateSlideContent().
 * @param {string}   [format="markdown"]  - One of: "markdown", "speaker_script", "pptx", "json", "all".
 * @param {object}   [opts]
 * @param {object[]} [opts.feedSources=[]]          - For PPTX appendix slide.
 * @param {object}   [opts.aggregates={}]            - For PPTX overview charts.
 * @param {object[]} [opts.visualizationSpecs=[]]    - For PPTX landscape slide.
 * @param {string}   [opts.outputPath=null]          - Absolute path for PPTX output.
 * @returns {Promise<object>} Object with one key per requested format.
 */
export async function exportDeck(slides, format = "markdown", opts = {}) {
  const {
    feedSources       = [],
    aggregates        = {},
    visualizationSpecs = [],
    outputPath        = null,
  } = opts;

  switch (format) {
    case "markdown":
      return { markdown: exportMarkdownDeck(slides) };

    case "speaker_script":
      return { speaker_script: exportSpeakerScript(slides) };

    case "json":
      return { json: slides };

    case "pptx": {
      if (!outputPath) {
        throw new Error("exportDeck: outputPath is required for format 'pptx'");
      }
      await exportPptx(slides, feedSources, aggregates, visualizationSpecs, outputPath);
      return { pptx_path: outputPath };
    }

    case "all": {
      const result = {
        markdown:       exportMarkdownDeck(slides),
        speaker_script: exportSpeakerScript(slides),
        json:           slides,
      };
      if (outputPath) {
        await exportPptx(slides, feedSources, aggregates, visualizationSpecs, outputPath);
        result.pptx_path = outputPath;
      }
      return result;
    }

    default:
      return { markdown: exportMarkdownDeck(slides) };
  }
}
