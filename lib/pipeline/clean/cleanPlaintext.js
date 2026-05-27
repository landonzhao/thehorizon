/**
 * Clean raw plaintext for LLM consumption.
 *
 * By the time this function is called, extractStructuredContent() has already
 * run: fenced code blocks have been replaced with their content (markers
 * stripped), and inline backtick markers have been removed. This function
 * therefore does NOT strip code content — it only strips formatting noise.
 *
 * LaTeX handling:
 * - Display math ($$...$$, \[...\]): stripped — these are usually long
 *   equations not useful as prose context.
 * - Inline math with complex commands ($\frac{...}$, $\mathbf{...}$, etc.):
 *   stripped — the LaTeX command is unreadable and adds no signal.
 * - Simple inline math ($n=100$, $95\%$): kept — the symbolic content
 *   (numbers, inequalities, percentages) is useful context for the LLM.
 */
export function cleanPlaintext(value = "") {
  return String(value || "")
    // Remove script and style blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Strip HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Common typographic entities
    .replace(/&mdash;/g, " — ")
    .replace(/&ndash;/g, " – ")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&bull;/g, " ")
    .replace(/&middot;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    // Unicode non-breaking spaces, figure spaces, BOM
    .replace(/[    -​\u2028\u2029﻿]/g, " ")
    // Zero-width characters and soft hyphen
    .replace(/[­‌-‏]/g, "")
    // ── LaTeX math ────────────────────────────────────────────────────────────
    // Display math: always strip ($$...$$, \[...\]) — usually long, unreadable
    .replace(/\$\$[\s\S]{0,1200}?\$\$/g, " ")
    .replace(/\\\[[\s\S]{0,1200}?\\\]/g, " ")
    // Display math: \( \) display form
    .replace(/\\\([\s\S]{0,400}?\\\)/g, " ")
    // Inline math: strip only when it contains LaTeX commands (\frac, \mathbf, etc.)
    // Simple inline math like $n=100$ or $\geq 95\%$ is kept for context.
    .replace(/\$(?=[^$\n]*\\[a-zA-Z])[^$\n]{0,300}?\$/g, " ")
    // LaTeX commands that wrap text — keep the inner content
    .replace(/\\(?:textbf|textit|emph|text|mathbf|mathrm|mathit|mathcal|mathbb|mathsf|operatorname|hat|tilde|bar|vec)\{([^{}]{0,100})\}/g, "$1")
    .replace(/\\(?:cite|ref|label|footnote|section|subsection|paragraph|caption)\{[^{}]{0,100}\}/g, " ")
    // All other \LaTeX commands and leftover braces
    .replace(/\\[a-zA-Z]+(?:\[[^\]]{0,50}\])?/g, " ")
    .replace(/(?<!\w)\{|\}(?!\w)/g, " ")
    // Tilde (LaTeX non-breaking space)
    .replace(/~/g, " ")
    // ── Markdown formatting ───────────────────────────────────────────────────
    // Fenced code blocks: by this point extractStructuredContent() has already
    // stripped the markers and kept the content inline. Any remaining ``` in
    // the text is a formatting artifact — collapse to whitespace.
    .replace(/`{3}[^\n]*\n?/g, " ")
    // Inline code backtick pairs: extractStructuredContent strips them first,
    // but handle any survivors (e.g. raw single-backtick items in HTML fields).
    .replace(/`([^`\n]+)`/g, "$1")
    // Strip markdown headers, emphasis markers, image links
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{2,3}([^*\n]+)\*{2,3}/g, "$1")
    .replace(/_{2}([^_\n]+)_{2}/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    // ── RSS / CMS boilerplate ─────────────────────────────────────────────────
    .replace(/\bThe post .{5,120} appeared first on .{3,80}\.\s*/gi, " ")
    .replace(/\bContinue reading\.{0,3}\s*»?\s*/gi, " ")
    .replace(/\bRead (the full story|more)\.{0,3}\s*»?\s*/gi, " ")
    .replace(/\bSubscribe (to|now).{0,60}\.\s*/gi, " ")
    .replace(/\bClick here to .{5,80}\.\s*/gi, " ")
    .replace(/\b(View|See) (full|original) (article|post|story).{0,30}\.\s*/gi, " ")
    // Copyright / trademark noise
    .replace(/[©®™°]/g, " ")
    // Repeated separator characters
    .replace(/[-=_|*~]{4,}/g, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
