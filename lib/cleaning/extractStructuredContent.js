/**
 * Extracts structured content from raw source text before cleaning.
 *
 * Fenced code blocks are extracted into `code_blocks` and their content is
 * kept inline in `processedText` (without the backtick markers) so that
 * IOCs and technical terms inside code are not destroyed by the text cleaner.
 *
 * IOC extraction focuses on high-signal, low-noise types:
 * - CVE IDs (very specific format, no false positives)
 * - IPv4 addresses (filter private ranges in callers if needed)
 * - Public URLs (https? only, strip trailing punctuation)
 */

const FENCED_CODE_BLOCK = /```(?:(\w*)\n)?([\s\S]*?)```/g;
const INLINE_CODE_SINGLE = /`([^`\n]+)`/g;

// IOC patterns — ordered by specificity (CVE first to avoid partial hash matches)
const CVE_PATTERN = /\bCVE-\d{4}-\d{4,7}\b/gi;
const IPV4_PATTERN = /\b((?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const URL_PATTERN = /https?:\/\/[^\s"'<>()[\]{},;]+/g;

// SHA-256: 64 hex chars near a label word ("sha256", "hash", "sha-256")
const SHA256_LABELED = /(?:sha-?256|hash)[\s:=]+([0-9a-fA-F]{64})\b/gi;
// MD5: 32 hex chars near a label word
const MD5_LABELED = /(?:md5|hash)[\s:=]+([0-9a-fA-F]{32})\b/gi;

function dedupe(arr) {
  return [...new Set(arr)];
}

function extractIocs(text) {
  const cves     = dedupe((text.match(CVE_PATTERN) || []).map((s) => s.toUpperCase()));
  const ips      = dedupe(text.match(IPV4_PATTERN) || []);
  const urls     = dedupe((text.match(URL_PATTERN) || []).map((s) => s.replace(/[.,;)]+$/, "")));

  const sha256s = [];
  let m;
  const sha256re = new RegExp(SHA256_LABELED.source, "gi");
  while ((m = sha256re.exec(text)) !== null) sha256s.push(m[1].toLowerCase());

  const md5s = [];
  const md5re = new RegExp(MD5_LABELED.source, "gi");
  while ((m = md5re.exec(text)) !== null) md5s.push(m[1].toLowerCase());

  return {
    cves,
    ips,
    urls,
    hashes: {
      sha256: dedupe(sha256s),
      md5:    dedupe(md5s),
    },
  };
}

/**
 * Extract code blocks and IOCs from rawText before the text cleaner runs.
 *
 * Returns:
 * - `code_blocks`:   array of { language, content } objects
 * - `iocs`:          { cves, ips, urls, hashes }
 * - `processedText`: rawText with code block markers removed but content
 *                    preserved inline, so the cleaner sees the actual code
 */
export function extractStructuredContent(rawText) {
  if (!rawText) return { code_blocks: [], iocs: { cves: [], ips: [], urls: [], hashes: { sha256: [], md5: [] } }, processedText: "" };

  const code_blocks = [];

  // Replace fenced code blocks: remove ``` markers but keep content
  const processedText = rawText
    .replace(FENCED_CODE_BLOCK, (match, lang, content) => {
      const trimmed = content.trim();
      if (trimmed) {
        code_blocks.push({ language: lang || "text", content: trimmed });
      }
      return trimmed;  // keep content inline, strip markers
    })
    .replace(INLINE_CODE_SINGLE, (match, content) => content);  // strip backtick but keep value

  // Extract IOCs from the original raw text (before markers are removed)
  // so URL patterns inside markdown links aren't missed
  const iocs = extractIocs(rawText);

  return { code_blocks, iocs, processedText };
}
