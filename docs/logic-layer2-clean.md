# Layer 2 — Clean

**File:** `lib/pipeline/clean/cleanLayer.js`
**No LLM calls.** Fully deterministic.

---

## Purpose

Normalise raw source text and remove duplicates before classification. Every source that passes Layer 1 is cleaned; the pipeline never hard-deletes sources at this stage — removed sources are returned in audit arrays.

---

## Steps

```
sources[]
    │
    ▼
Step 1: cleanSources()         — normalise text, version-stamp
    │
    ▼
Step 2: dedupeSources()        — collapse exact duplicates
    │
    ▼
Step 3: detectNearDuplicates() — collapse near-duplicate titles
    │
    ▼
clean_sources[]
```

---

## Step 1 — Text Cleaning (`cleanSources.js`)

Idempotent: sources stamped with the current `CLEANING_VERSION` are skipped.

Operations applied (in order):
1. Strip HTML tags and entities
2. Strip LaTeX math (`$...$`, `$$...$$`, `\begin{...}...\end{...}`)
3. Collapse repeated whitespace and normalise line breaks
4. Strip boilerplate footers (cookie notices, subscription prompts, "read more" cruft)
5. Extract code blocks — store as `extracted_code_blocks[]` before stripping from body
6. Extract IOC candidates — IPs, domains, hashes, CVE IDs → `extracted_iocs[]`
7. Trim to max 10 000 chars for `clean_text`

Output fields added:
- `clean_text` — normalised body text
- `extracted_code_blocks` — raw code blocks removed from body
- `extracted_iocs` — extracted indicators of compromise
- `cleaning_version` — idempotency stamp

---

## Step 2 — Exact Deduplication (`dedupeSources.js`)

Collapses sources that are the same content under different URLs or IDs. Keeps the highest-quality copy (prefer primary/curated trust tier, then longest text).

Three dedup keys checked (in order):
1. `canonical_url` — URL with tracking params stripped, lowercased
2. Normalised title — lowercase, punctuation removed, whitespace collapsed
3. Content hash — SHA-256 of the first 500 chars of `clean_text`

If multiple sources match on any key, all but the best-quality source are removed and listed in `removed_exact[]`.

---

## Step 3 — Near-Title Deduplication (`detectNearDuplicates.js`)

Catches sources that cover the same story under slightly different headlines (syndicated news, retweeted research).

Algorithm:
1. Tokenise each title: lowercase, strip punctuation, split on whitespace.
2. Remove stop words (the, a, an, is, are, ...).
3. Compute pairwise Jaccard similarity on title word sets.
4. Pairs with similarity ≥ `nearDupThreshold` (default **0.85**) are collapsed.
5. Within each near-dup group, keep the source with the higher trust tier; break ties by longer text.

Removed sources go to `removed_near[]`.

Set `nearDupThreshold: 1.0` or `skipNearDup: true` to disable near-dup detection.

---

## Output

```js
{
  clean_sources: object[],    // deduplicated, cleaned sources
  counts: {
    input:               number,
    after_clean:         number,  // same as input (cleaning is non-destructive)
    after_exact_dedup:   number,
    after_near_dedup:    number,
  },
  removed_exact: [{ removed_id, removed_title, reason }],
  removed_near:  [{ removed_id, removed_title, kept_id, similarity }],
  cleaning_version: string,
}
```
