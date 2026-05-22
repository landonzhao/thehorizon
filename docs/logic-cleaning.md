# Source Cleaning Logic

## What it does

Cleaning converts raw web content — which arrives as a mix of HTML, RSS XML, Markdown, LaTeX, and CMS boilerplate — into plain text that downstream systems (classifiers, scorers, LLMs) can process reliably.

Cleaning runs **twice**: once inside `normalizeSource` (at collection time, on every source), and once more on the stored sources via `cleanSources` before they reach the window filter. The second pass ensures that any source that was stored before a cleaning improvement gets re-cleaned on the next ingestion cycle.

---

## Two cleaning functions

### `cleanText`

Used for short fields: `title`, `publisher`, `author`. Does basic whitespace normalisation only — collapses multiple spaces and strips leading/trailing whitespace. These fields are typically already clean in RSS feeds.

### `cleanPlaintext`

Used for `full_text` and `summary`. These arrive as raw HTML from RSS, XML excerpts from APIs, Markdown from GitHub, or LaTeX from arXiv. The function runs a sequence of targeted replacements in a fixed order.

---

## Cleaning stages (in order)

### 1. Remove executable content
Script and style blocks are deleted entirely (not just stripped of tags). These blocks could otherwise contribute nonsense tokens to phrase matching and LLM prompts.

### 2. Strip HTML tags
All remaining `<...>` constructs become a single space. This handles every HTML element — block, inline, and self-closing — without needing an HTML parser.

### 3. Decode HTML entities
Named and numeric entities are converted to their characters. The order matters: common typographic entities (`&mdash;`, `&ndash;`, `&ldquo;`, `&rdquo;`, `&lsquo;`, `&rsquo;`, `&hellip;`, `&bull;`) are decoded explicitly to readable punctuation before the catch-all. The catch-all (`&[a-zA-Z]+;`) replaces any remaining named entity with a space rather than leaving it as a literal `&name;` string in the output.

Explicit decodes ensure that, for example, `&mdash;` becomes ` — ` (a readable em-dash) rather than a space, which would silently merge words.

### 4. Strip Unicode noise
Non-breaking spaces, figure spaces, thin spaces, and related Unicode whitespace variants (U+00A0, U+202F, U+2007, U+2000–U+200B, U+2028, U+2029, U+FEFF) become regular spaces. Zero-width characters (U+200C–U+200F), soft hyphens (U+00AD) are removed entirely because they are invisible but disrupt string matching.

### 5. Strip LaTeX (arXiv sources)
arXiv abstracts use LaTeX math and commands. These are handled in layers:
- Displayed math blocks (`$$ ... $$`, `\[ ... \]`) are removed entirely.
- Inline math (`$ ... $`, `\( ... \)`) is removed entirely.
- Formatting commands that wrap text (`\textbf{X}`, `\emph{X}`, etc.) keep the inner text.
- Reference/citation commands (`\cite{}`, `\ref{}`, `\label{}`) are removed.
- All remaining `\command` patterns and leftover braces are removed.
- Tilde (`~`, LaTeX non-breaking space) becomes a regular space.

This is important because arXiv is the primary source of academic research in the pipeline. Without LaTeX stripping, phrase matching would fail on strings like `adversarial\textit{examples}`.

### 6. Strip Markdown
Headers, bold, italic, code fences, inline code, and `[text](url)` links are cleaned. Images are removed. This targets GitHub README files, security blog posts, and newsletter content that uses Markdown.

### 7. Remove RSS/CMS boilerplate
Feed items often append standard footers:
- "The post X appeared first on Y."
- "Continue reading..."
- "Read the full story..."
- "Subscribe to..."
- "Click here to..."

These are pattern-matched and removed. Without this, a classifier would pick up the same boilerplate phrases as signal.

### 8. Remove copyright symbols
© ® ™ ° become spaces. These appear frequently in vendor content and add noise.

### 9. Remove repeated separators
Four or more of `- = _ | * ~` become a space. These are common visual dividers in Markdown and email-formatted content.

### 10. Collapse whitespace
Multiple consecutive spaces become a single space. Three or more consecutive newlines become two (preserving paragraph breaks). Leading and trailing whitespace is stripped.

---

## Why cleaning runs before everything else

Classifiers, scorers, and LLMs all work on text. If the text contains HTML tags, entities, or LaTeX commands, phrase matching fails — `prompt injection` may not match `prompt&amp;nbsp;injection` or `\textit{prompt injection}`. The AI specificity score, tag matching, and LLM summaries all degrade with dirty text. Cleaning first means every downstream component operates on the same clean baseline.
