import { cleanText } from "./cleanText.js";
import { cleanPlaintext } from "./cleanPlaintext.js";
import { extractStructuredContent } from "./extractStructuredContent.js";

export const CLEANING_VERSION = "clean-v2.0";

/**
 * Non-destructive cleaning pass.
 *
 * Preserves raw content alongside the cleaned version so that:
 * - Code blocks and their IOC content are not silently discarded
 * - The original text can be re-cleaned when CLEANING_VERSION changes
 * - Structured artefacts (code_blocks, iocs) are available to downstream steps
 *
 * Idempotent: sources already stamped with the current CLEANING_VERSION are
 * returned unchanged, avoiding redundant work during re-ingestion backfills.
 */
export function cleanSources(sources) {
  return sources.map((source) => {
    // Skip if already cleaned with this version
    if (source.cleaning_version === CLEANING_VERSION) return source;

    // Preserve the raw text received from the connector
    const raw_text = source.raw_text || source.full_text || "";
    const raw_html = source.raw_html || "";

    // Extract structured content (code blocks, IOCs) from the raw text.
    // This runs BEFORE cleanPlaintext so that:
    // - Code block content (including IOCs) is captured into extracted_code_blocks
    // - Code block markers are removed but content stays inline in processedText
    // - The cleaner never sees the ``` delimiters, so it cannot strip code content
    const { code_blocks, iocs, processedText } = extractStructuredContent(raw_text);

    // Clean the processed text (code block markers already removed)
    const clean_text = processedText
      ? cleanPlaintext(processedText)
      : cleanPlaintext(raw_text);  // fallback for sources with no structured content

    return {
      ...source,

      // Preserve raw content for archiving and re-cleaning
      raw_text,
      raw_html,

      // Cleaned content (what the LLM and scoring steps use)
      clean_text,
      full_text: clean_text,  // backward-compat: pipeline reads full_text

      // Structured content extracted before cleaning
      extracted_code_blocks: code_blocks,
      extracted_iocs: iocs,

      // Version stamp
      cleaning_version: CLEANING_VERSION,

      // Clean simple text fields (title, publisher, author never contain code)
      title:     cleanText(source.title),
      publisher: cleanText(source.publisher),
      author:    cleanText(source.author),
      summary:   source.summary ? cleanPlaintext(source.summary) : source.summary,
    };
  });
}
