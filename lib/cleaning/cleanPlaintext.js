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
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    // Unicode non-breaking spaces, figure spaces, BOM
    .replace(/[\u00a0\u202f\u2007\u2000-\u200b\u2028\u2029\ufeff]/g, " ")
    // Zero-width characters and soft hyphen
    .replace(/[\u00ad\u200c-\u200f]/g, "")
    // LaTeX math blocks (common in arXiv abstracts and academic sources)
    .replace(/\$\$[\s\S]{0,800}?\$\$/g, " ")
    .replace(/\$[^$\n]{0,300}?\$/g, " ")
    .replace(/\\\[[\s\S]{0,800}?\\\]/g, " ")
    .replace(/\\\([\s\S]{0,300}?\\\)/g, " ")
    // LaTeX commands that wrap text — keep the inner content
    .replace(/\\(?:textbf|textit|emph|text|mathbf|mathrm|mathit|mathcal|mathbb|mathsf|operatorname|hat|tilde|bar|vec)\{([^{}]{0,100})\}/g, "$1")
    .replace(/\\(?:cite|ref|label|footnote|section|subsection|paragraph|caption)\{[^{}]{0,100}\}/g, " ")
    // All other \LaTeX commands and leftover braces
    .replace(/\\[a-zA-Z]+(?:\[[^\]]{0,50}\])?/g, " ")
    .replace(/(?<!\w)\{|\}(?!\w)/g, " ")
    // Tilde (LaTeX non-breaking space)
    .replace(/~/g, " ")
    // Strip markdown formatting artifacts
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{2,3}([^*\n]+)\*{2,3}/g, "$1")
    .replace(/_{2}([^_\n]+)_{2}/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    // RSS / CMS boilerplate
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
