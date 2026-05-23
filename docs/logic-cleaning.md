# Source Cleaning Logic

## What it does

Cleaning converts raw web content — which arrives as a mix of HTML, RSS XML, Markdown, LaTeX, and CMS boilerplate — into plain text that downstream systems (classifiers, scorers, LLMs) can process reliably.

Cleaning is **non-destructive**: the original text is preserved in `raw_text` while the cleaned version is written to `clean_text`. Code blocks and their IOC content are extracted before cleaning and preserved in `extracted_code_blocks` and `extracted_iocs`. Sources already stamped with the current `CLEANING_VERSION` are returned unchanged, avoiding redundant work on re-ingestion.

---

## Three cleaning functions

### `cleanText`

Used for short fields: `title`, `publisher`, `author`. Does basic whitespace normalisation only — collapses multiple spaces and strips leading/trailing whitespace. These fields are typically already clean in RSS feeds.

### `extractStructuredContent`

Runs **before** `cleanPlaintext` to extract structured artefacts that the text cleaner would otherwise destroy:

- **Fenced code blocks** (```` ``` ````): extracted into `code_blocks` array (`{ language, content }`). The backtick markers are removed, but the code content is kept inline in `processedText` so downstream steps (IOC extraction, LLM prompts) can still see it.
- **Inline code** (`` `code` ``): markers stripped, value kept.
- **IOCs** extracted from the raw text (before marker removal): CVE IDs, IPv4 addresses, public URLs (https?), and labelled SHA-256/MD5 hashes.

Returns `{ code_blocks, iocs, processedText }`. The cleaner runs on `processedText`.

Why this order matters: if `cleanPlaintext` ran first, its code fence stripping would discard the content (including CVE IDs and IPs inside code blocks) before IOCs could be extracted. Running extraction first preserves those signals.

### `cleanPlaintext`

Used for `full_text` and `summary`. Runs on the `processedText` output of `extractStructuredContent`. These arrive as raw HTML from RSS, XML excerpts from APIs, Markdown from GitHub, or LaTeX from arXiv. The function runs a sequence of targeted replacements in a fixed order.

---

## Cleaning stages (in order)

### 1. Remove executable content
Script and style blocks are deleted entirely (not just stripped of tags). These blocks could otherwise contribute nonsense tokens to phrase matching and LLM prompts.

### 2. Strip HTML tags
All remaining `<...>` constructs become a single space. This handles every HTML element — block, inline, and self-closing — without needing an HTML parser.

### 3. Decode HTML entities
Named and numeric entities are converted to their characters. Common typographic entities (`&mdash;`, `&ndash;`, `&ldquo;`, `&rdquo;`, `&lsquo;`, `&rsquo;`, `&hellip;`, `&bull;`) are decoded explicitly to readable punctuation before the catch-all.

### 4. Strip Unicode noise
Non-breaking spaces, figure spaces, thin spaces, and related Unicode whitespace variants (U+00A0, U+202F, U+2007, U+2000–U+200B, U+2028, U+2029, U+FEFF) become regular spaces. Zero-width characters (U+200C–U+200F) and soft hyphens (U+00AD) are removed entirely.

### 5. Strip LaTeX (arXiv sources)
arXiv abstracts use LaTeX math and commands. These are handled in layers:

- **Display math** (`$$ ... $$`, `\[ ... \]`, `\( ... \)`): stripped entirely — these are long equations that add no readable signal.
- **Inline math with LaTeX commands** (`$\frac{...}$`, `$\mathbf{...}$`, etc.): stripped — the command syntax is unreadable.
- **Simple inline math** (`$n=100$`, `$\geq 95\%$`): **preserved** — the numeric content is useful context for LLMs and classifiers.
- Formatting commands wrapping text (`\textbf{X}`, `\emph{X}`, etc.): keep the inner text.
- Reference/citation commands (`\cite{}`, `\ref{}`, `\label{}`): removed.
- Remaining `\command` patterns and leftover braces: removed.

### 6. Handle remaining Markdown artefacts
By the time `cleanPlaintext` runs, `extractStructuredContent` has already removed code block markers. Any surviving `` ``` `` sequences (e.g., from HTML fields) are collapsed to whitespace. Headers, bold, italic, and `[text](url)` links are cleaned. Images are removed.

### 7. Remove RSS/CMS boilerplate
Feed items often append standard footers ("The post X appeared first on Y.", "Continue reading...", etc.). These are pattern-matched and removed.

### 8. Remove copyright symbols and repeated separators
© ® ™ ° become spaces. Four or more of `- = _ | * ~` become a space.

### 9. Collapse whitespace
Multiple consecutive spaces become a single space. Three or more consecutive newlines become two. Leading and trailing whitespace is stripped.

---

## Version stamping

Every source passing through `cleanSources` receives `cleaning_version = CLEANING_VERSION` (currently `"clean-v2.0"`). On re-ingestion, sources already bearing this version are returned unchanged. When `CLEANING_VERSION` is bumped (e.g., after improving LaTeX handling), all stored sources will be re-cleaned on the next backfill or ingestion run.

---

## Fields produced

| Field | Description |
|---|---|
| `raw_text` | Original text from connector, before any cleaning |
| `clean_text` | Cleaned text (what LLMs and scorers consume) |
| `full_text` | Alias for `clean_text` (backward compatibility) |
| `extracted_code_blocks` | Array of `{ language, content }` objects |
| `extracted_iocs` | `{ cves, ips, urls, hashes: { sha256, md5 } }` |
| `cleaning_version` | Version stamp, e.g. `"clean-v2.0"` |

---

## Why cleaning runs before everything else

Classifiers, scorers, and LLMs all work on text. If the text contains HTML tags, entities, or LaTeX commands, phrase matching fails. The AI specificity score, tag matching, and LLM summaries all degrade with dirty text. Cleaning first means every downstream component operates on the same clean baseline.
