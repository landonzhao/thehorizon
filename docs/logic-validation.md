# Source Validation Logic

## What it does

Validation is a three-stage gate that runs after cleaning and before storage. It removes duplicates, rejects sources of the wrong type, and produces two independent scores that measure structural data quality and publisher reputation separately. Sources that fail hard gates are dropped before they reach the database.

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

After canonicalisation, if two sources share the same canonical URL, the lower-quality one is dropped. Quality is measured by: trust tier, text richness, date presence, date confidence, and CVE references in the title or text. This means a CISA advisory (primary tier, full text) beats a news summary of the same URL even if the news article was ingested first.

**Title normalisation**:
- Lowercases the title
- Strips all punctuation
- Collapses whitespace

If two sources share the same normalised title (even with different URLs), the lower-quality one is dropped. This catches syndicated CVE advisories that appear across multiple outlets with identical headlines.

**Cross-run deduplication**: handled by the database layer — Supabase upserts on `id` (URL-derived SHA256) silently overwrite rather than duplicate.

---

## Stage 2: Source type filter

**Purpose**: Accept source types the pipeline is designed to handle. All decisions are based on source type and, for conditional types, source content.

**Always accepted** (unconditional):

| Source type | Accepted |
|---|---|
| `news` | Yes |
| `vendor_advisory` | Yes |
| `security_blog` | Yes |
| `government_advisory` | Yes |
| `policy_update` | Yes |
| `threat_intel` | Yes |
| `research_paper` | Yes |
| `security_framework` | Yes |
| `ai_lab_update` | Yes |
| `vulnerability_database` | Yes |

**Conditionally accepted**:

| Source type | Accepted when | `needs_review` |
|---|---|---|
| `unknown` | Always (type not determinable) | Yes |
| `incident_database` | Always | No |
| `ai_threat_framework` | Always | No |
| `social_signal` | `trust_tier` is `primary`, `high`, or `curated` only | No |
| `open_source_project` | Title or full text contains a CVE reference or security advisory language | No |

**Hard rejected**: Any type not listed above (completely unknown connector type).

Curated sources bypass type filtering entirely — they were manually vetted by an analyst before import.

---

## Stage 3: Validity scoring — split model

**Purpose**: Assess each source on two independent dimensions: structural data completeness and publisher reputation. These must not be combined at this layer.

### `structural_validity_score` (0–90)

Measures data completeness only. Trust tier has no effect.

| Condition | Effect |
|---|---|
| Base (title present + URL safe) | 50 |
| Publisher field present | +0 |
| Publisher field missing | −10 |
| Date present and confidence = exact or estimated | +0 |
| Date missing | −15 |
| Date confidence = low | −5 |
| Date confidence = none | −8 |
| Full text ≥ 500 chars | +15 |
| Full text ≥ 50 chars | +5 |
| Full text < 50 chars | −5 |
| URL returns confirmed error (4xx/5xx) | −10 |

**Maximum possible score: 65** (50 base + 15 for text ≥ 500, with publisher and date present). A source missing the publisher scores max 55; missing the date scores max 50.

**Hard gates** — score = 0, label = `do_not_use`, source dropped before any other check:
- Missing or empty title
- Missing, unsafe, or HTTP URL that does not redirect to HTTPS

### `publisher_trust_score` (0–10)

Measures publisher reputation. Derived solely from `trust_tier` at collection time. Independent of data quality.

| Trust tier | `publisher_trust_score` |
|---|---|
| `primary` | 10 |
| `curated` | 9 |
| `high` | 8 |
| `medium` | 6 |
| `low` | 3 |
| `unknown` | 2 |

Note: `publisher_trust_score = 9` for curated sources reflects that manually imported sources are from known-good publishers. This is separate from their scoring weight (see `logic-trust.md`).

### Credibility label

Derived from `structural_validity_score` alone. Used to determine source usability.

| Score | Label | Reachable? |
|---|---|---|
| ≥ 80 | `primary` | No — max score is 65 |
| ≥ 65 | `high_trust` | Yes — perfect source (publisher + date + long text) |
| ≥ 45 | `medium_trust` | Yes — most well-formed sources |
| ≥ 25 | `low_trust` | Yes — poor data quality |
| < 25 | `do_not_use` | Yes — dropped before storage |

The `primary` label is unreachable because the score uses penalties (−10 for missing publisher, −15 for missing date) rather than bonuses for having them. A perfect source scores exactly 65 and lands at `high_trust`. This is a known calibration issue — the label exists in the code but is never assigned.

A source is usable (`usable: true`) if and only if its `credibility_label` is not `do_not_use`. The higher labels are informational metadata stored in archives; they do not gate the scoring pipeline.

### URL safety check

Runs concurrently for all sources in a batch (one timeout window per batch).

- Must be HTTPS. HTTP is only accepted if it redirects to an HTTPS destination.
- Must not be localhost, 127.0.0.1, ::1, or any `.local` / `.internal` hostname.
- Must not be a private IPv4 address (10.x, 172.16–31.x, 192.168.x, 169.254.x).

A HEAD request is issued against each URL (3-second timeout). A confirmed error response (4xx/5xx) applies a −10 penalty and records `url_reachable: false`. A timeout or network error records `url_reachable: null` with no penalty.

The `final_url` (HTTPS destination after any HTTP→HTTPS redirect) is stored separately and used in report link construction.

---

## What the two scores mean

**`structural_validity_score`** answers: *is this source record well-formed?* A low score means missing fields or broken URLs, not low-quality content.

**`publisher_trust_score`** answers: *how much weight should we give the publishing organisation?* This flows downstream into the priority and report scoring formula (`lib/scoring/relevanceRules.js: CREDIBILITY_BY_TIER`), where curated sources score 6 (same as medium) — see `logic-trust.md`.

The two scores are kept separate so a primary-tier publisher with a missing title is still flagged as `do_not_use`, and a well-formed blog post from an unknown source is correctly assessed for its structural quality.
