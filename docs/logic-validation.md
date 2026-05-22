# Source Validation Logic

## What it does

Validation is a three-stage gate that runs after cleaning and before storage. It removes duplicates, rejects sources of the wrong type, and scores each source's structural integrity. Sources that fail hard gates are dropped before they ever reach the database.

The three stages run in order: deduplication → source type filter → validity scoring.

---

## Stage 1: Deduplication

**Purpose**: Prevent the same article from being ingested twice in the same run, either because two connectors found the same URL, or because two different URL forms point to the same content.

**URL canonicalisation**:
- Removes UTM tracking parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`)
- Removes advertising click IDs (`fbclid`, `gclid`)
- Removes URL fragments (`#section-name`)
- Strips trailing slashes
- Lowercases the entire URL

After canonicalisation, if two sources share the same canonical URL, the second is dropped.

**Title normalisation**:
- Lowercases the title
- Strips all punctuation
- Collapses whitespace

If two sources share the same normalised title (even with different URLs), the second is dropped. This catches cases where a CVE advisory is syndicated to multiple outlets with the same headline.

**First-seen wins**: The first occurrence in the array is kept. Since connectors run in parallel and their results are concatenated in a fixed order, this is deterministic.

**Note**: Deduplication across different daily runs is handled by the database layer — Supabase upserts on `id` (URL-derived SHA256). Within a single run, the in-memory deduplication above handles it.

---

## Stage 2: Source type filter

**Purpose**: Accept only source types the pipeline is designed to handle. Reject source types that would never contribute useful intelligence.

**Accepted types** (whitelist):
- `news` — general news with security relevance
- `vendor_advisory` — security vendor advisories
- `security_blog` — practitioner and vendor security blogs
- `government_advisory` — CISA, NCSC, CSA, ENISA, etc.
- `policy_update` — AI/cyber policy documents
- `threat_intel` — structured threat intelligence
- `research_paper` — academic papers (primarily arXiv)
- `security_framework` — OWASP, NIST, MITRE frameworks
- `ai_lab_update` — AI lab safety and research updates
- `vulnerability_database` — NVD CVE records

**Explicitly rejected types** (not a failure to match, a hard rejection):
- `open_source_project` — code repositories without intelligence value
- `social_signal` — social media posts (too noisy, no editorial control)
- `ai_threat_framework` — framework documents are reference material, not intelligence
- `incident_database` — incident database entries (often historical, already processed via dedicated connectors)

**Unknown types**: Also rejected. The filter is a whitelist. If a new connector introduces a type not in the list, it fails visibly rather than silently passing through.

---

## Stage 3: Validity scoring

**Purpose**: Assess the structural integrity of each source and determine whether it is usable for downstream processing.

**Scoring starts at 50/100**, then adjustments are applied:

| Condition | Adjustment |
|---|---|
| Trust tier = primary | +35 |
| Trust tier = high | +25 |
| Trust tier = medium | +10 |
| Trust tier = low | −5 |
| Missing title | −40 |
| Missing publisher | −10 |
| Missing publication date | −5 |
| Full text < 50 characters | −5 |
| URL returns error response | −10 |

Missing title and missing/unsafe URL are **hard gates**: sources failing either check are immediately rejected with score 0 before any other scoring occurs. They never reach the database.

The score is clamped to [0, 100].

**Credibility label** from score:

| Score | Label |
|---|---|
| ≥ 85 | `primary` |
| ≥ 75 | `high_trust` |
| ≥ 55 | `medium_trust` |
| ≥ 30 | `low_trust` |
| < 30 | `do_not_use` |

**Usability gate**: A source is usable if and only if:
- It has a non-empty title
- It has a non-empty URL
- The URL is safe (see below)
- The credibility label is not `do_not_use`

Sources that are not usable are dropped before storage.

**URL safety check**:
- Must be HTTPS. HTTP is rejected (no exception).
- Must not be localhost, 127.0.0.1, ::1, or any `.local` / `.internal` hostname.
- Must not be a private IPv4 address (10.x, 172.16–31.x, 192.168.x, 169.254.x).

A HEAD request is issued against each URL (3-second timeout). A confirmed error response (4xx/5xx) applies a −10 penalty and records `url_reachable: false` on the validity result. A timeout or network error records `url_reachable: null` with no penalty — the source may be temporarily unreachable. All checks run concurrently so the batch adds only one timeout window to the pipeline.

This prevents server-side request forgery if a malicious RSS feed includes internal URLs, and ensures sources remain accessible for analyst follow-up.

---

## What the validity score is and is not

The validity score measures **data quality and structural completeness**. It is not a measure of content relevance or credibility of the publication itself. A low validity score means "this record is poorly formed" — missing key fields, unsafe URL, etc.

Content credibility (is this a trustworthy source of AI threat intelligence?) is handled separately via `trust_tier` (set at collection time from the source registry) and ultimately the priority scoring layer.
