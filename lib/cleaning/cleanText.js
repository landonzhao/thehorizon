export function cleanText(text = "") {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
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
    // Unicode whitespace variants and zero-width characters
    .replace(/[\u00a0\u200b-\u200f\u2028\u2029\ufeff\u00ad]/g, " ")
    // Copyright/trademark symbols
    .replace(/[©®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
