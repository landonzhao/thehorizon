# Ingestion Logic

## What it does

Ingestion pulls raw articles, advisories, and research papers from external sources and normalises them into a common format. It runs automatically every day at 22:00 UTC (06:00 SGT the next morning) via a Vercel cron job hitting `/api/refresh`.

---

## LLM usage in this layer

One of the four connectors uses an LLM. The others are deterministic API calls.

| Connector | LLM? | Model | API key |
|---|---|---|---|
| Registry feeds (RSS/Atom) | No | — | — |
| arXiv | No | — | — |
| NVD | No | — | — |
| **LLM Discovery** | **Yes** | `gemini-2.5-flash` with Google Search grounding | `GEMINI_API_KEY` |

The LLM Discovery connector is skipped entirely if `GEMINI_API_KEY` is not set.

---

## Time window

All ingestion is anchored to Singapore Time (SGT, UTC+8). The standard daily window covers **06:00 SGT yesterday → 06:00 SGT today**. Any source whose `date_published` falls outside this window is discarded, regardless of when it was discovered.

The cron fires at 22:00 UTC which is 06:00 SGT, so the window closes exactly when the job runs.

For historical backfills, the `?days=N` parameter widens the window to N days ending at end-of-day UTC.

---

## Connectors

Four connector types run in **parallel** on every daily cycle.

### 1. Registry feeds (RSS / Atom)

~35 curated feeds from the source registry. Each feed is fetched, parsed, and the **50 most recent items** are extracted. The 50-item cap balances freshness against the volume of low-relevance content from high-volume outlets (BleepingComputer, SecurityWeek, etc.). AI relevance is not checked here — that happens at classification.

Trust tier is hardcoded per feed in the registry:
- `primary` — government agencies (CISA, NCSC, CSA, ENISA, NIST), AI labs (Anthropic, OpenAI)
- `high` — established security vendors, reputable practitioner and academic blogs
- `medium` — general security news outlets

Each connector is given a 6-second timeout. If the feed does not respond in time, it is skipped and marked as failed without taking down the rest of the run.

### 2. arXiv

**16 targeted queries** against the arXiv API, covering distinct AI threat categories. Expanded from the original 7 to include new topics:

**Original 7 categories:**
- LLM jailbreaks and prompt injection
- LLM and foundation model security
- AI-enabled attacks (deepfakes, disinformation, voice cloning)
- Traditional ML model attacks (poisoning, extraction, evasion, backdoors)
- Agentic AI and autonomous system security
- MCP, tool use, RAG, and LLM plugin security
- AI safety and alignment with security implications

**9 new query topics added:**
- RAG poisoning and retrieval-augmented generation security
- ML supply chain and model integrity attacks (Hugging Face, unsafe deserialization)
- AI-powered phishing and social engineering
- AI coding assistant and IDE security (Copilot, Cursor, Claude Code)
- Adversarial robustness and input perturbation
- Privacy attacks — training data inference and extraction
- Autonomous cyber operations and AI-driven exploitation
- LLM agent tool abuse and orchestration attacks
- Synthetic identity and deepfake fraud

Queries primarily use title-based matching (`ti:`) against `cs.CR` and `cs.AI`. Abstract search (`abs:`) is used selectively for very specific technical terms (e.g. `"prompt injection attack"`, `"RAG poisoning"`) where it is unlikely to introduce noise.

A 5-second delay runs between each query to stay within arXiv's rate limits. On 429 or 503 responses, the connector retries up to 3 times with exponential backoff. Total timeout: 180 seconds.

Trust tier: `high` (arXiv is an academic institution).

### 3. NVD (National Vulnerability Database)

Runs **17 keyword searches** against the NVD API, deduplicating all results by CVE ID before returning. Searches run in parallel batches of 4, with a 6.5-second pause between batches to respect NVD's rate limit (5 requests per 30 seconds without an API key). Total timeout: 45 seconds.

**Keyword list:**
artificial intelligence, machine learning, large language model, neural network, deep learning, generative AI, LLM, AI model, AI assistant, foundation model, AI agent, prompt injection, adversarial machine learning, jailbreak, model poisoning, chatbot, Copilot

After retrieval, a post-fetch filter (`hasAiRelevance`) checks each CVE description against 22 AI-relevant terms (broader than the search keywords) to eliminate false positives.

This connector catches AI-related CVEs same-day, before CISA advisories that often lag by days.

### 4. LLM Discovery — `gemini-2.5-flash` + `GEMINI_API_KEY`

Uses Gemini 2.5 Flash with **Google Search grounding** to surface URLs that structured feeds miss — particularly agentic AI attacks, MCP risks, and emerging techniques that haven't reached major outlets yet.

Four prompts run **sequentially** (not in parallel) because Gemini's free tier allows only 10 requests per minute. A 7-second delay between prompts keeps the connector under that limit. The four queries cover:
- Agentic AI security and coding assistant vulnerabilities
- MCP server security
- Prompt injection in coding tools
- AI threat landscape (nation-state use, AI malware, deepfake fraud)

Grounding chunks — the Google-verified URIs Gemini cited — become the discovered sources.

**Date handling**: LLM Discovery cannot determine when an article was actually published. The connector:
1. Attempts to infer a date from common URL patterns (`/2025/01/article-title/`, `-2024-10-15-`, etc.)
2. Sets `date_published` to the current collection time (ensures the source passes the daily window filter)
3. Sets `date_published_actual` to the inferred date (or `null` if not determinable)
4. Sets `date_confidence` to `"estimated"` (URL pattern found) or `"low"` (no date inferable)
5. Sets `eligible_for_daily_report = false` for sources where the inferred date is older than 48 hours — these are historical references, not breaking news

**This connector is skipped entirely if `GEMINI_API_KEY` is not set.**

---

## Normalisation

Every source, regardless of connector, passes through `normalizeSource` before entering the pipeline:

- **ID**: SHA256 hash of the URL (first 36 chars). The same article always gets the same ID. Re-ingesting the same URL upserts rather than duplicates.
- **URL**: arXiv HTTP URLs are upgraded to HTTPS. All other URLs are used as-is.
- **Text**: `full_text`, `title`, and `summary` all run through `cleanPlaintext` at normalisation time.
- **Date fields**: Four date-related fields are set at normalisation:
  - `date_published`: the article's publish date (null if not available)
  - `date_published_actual`: the real publish date (same as `date_published` for most sources; null for LLM Discovery when unknown)
  - `date_discovered`: always set to the collection timestamp (when this ingestion run found the URL)
  - `date_confidence`: `"exact"` (from feed/API), `"estimated"` (inferred from URL), `"low"` (collection time used), or `"none"` (no date at all)
- **Trust tier**: Inherited from the connector's registry entry or hardcoded collection metadata.
- **Content hash**: SHA256 of `title|url|full_text` — used to detect identical content arriving from different sources.

---

## URL safety check

`lib/validation/urlSafety.js` provides two check levels:

**`isSafeUrl(url)`** — synchronous, HTTPS-only check. Rejects: HTTP, localhost, 127.0.0.1, private IPv4 ranges, .local/.internal hostnames.

**`checkUrlSafety(url)`** — async, follows HTTP redirects. Returns `{ safe, final_url, status }`:
- `"safe"` — HTTPS URL with public host
- `"http_redirects_to_https"` — HTTP URL that redirects to a safe HTTPS destination; `final_url` is the HTTPS target
- `"unsafe_redirect"` — redirect destination is HTTP or private
- `"private_ip"` — host resolves to a private range
- `"unsafe_protocol"` — non-HTTP/HTTPS protocol, or HTTP that could not be followed
- `"invalid"` — malformed URL

HTTP URLs that redirect to HTTPS are accepted (safe = true). The `final_url` (the HTTPS destination) is stored and used for subsequent reachability checks.

---

## Deduplication

`dedupeSources` (`lib/utils/dedupe.js`) removes within-batch duplicates by canonical URL, normalised title, and content hash. **Quality-based selection**: when two sources share a key, the one with the highest quality score is kept rather than the first-seen.

**Quality score components:**
- Trust tier: primary=50, curated=45, high=40, medium=25, low=10, unknown=5
- Text richness: >1000 chars=+20, >500=+12, >200=+6
- Has date: +8
- Date confidence: exact=+5, estimated=+2
- CVE reference in title/text: +8

This means a CISA advisory (primary tier, rich text) beats a news summary of the same event even if the news article was ingested first.

Cross-run deduplication: Supabase upserts on `id` (URL-derived SHA256) silently overwrite rather than duplicate.

---

## Source type filtering

`filterAcceptableSources` (`lib/sources/filterAcceptableSources.js`) applies a two-track decision:

**Always accepted:**
news, vendor_advisory, security_blog, government_advisory, policy_update, threat_intel, research_paper, security_framework, ai_lab_update, vulnerability_database

**Conditionally accepted:**
- `unknown` → accepted, marked `needs_review = true`
- `incident_database` → always accepted
- `ai_threat_framework` → always accepted (MITRE ATLAS, OWASP entries)
- `social_signal` → accepted only if `trust_tier` is `primary`, `high`, or `curated` (e.g. official CISA tweet)
- `open_source_project` → accepted only if title or full_text contains a CVE reference or security-advisory language

**Hard rejected:**
- Missing title or URL only. Source type alone is never a hard rejection reason.

Previously hard-rejected types (`open_source_project`, `social_signal`, `ai_threat_framework`, `incident_database`) are now conditionally accepted because they can carry high-value AI security content.

---

## Validity scoring (split model)

`lib/validation/sourceValidity.js` now returns two separate scores:

**`structural_validity_score`** (0–90): data completeness only. No trust tier adjustment.
- Base: 50 (has title + safe URL)
- Publisher present: +0 / absent: −10
- Date present: +0 / absent: −15
- Date confidence low: −5, none: −8
- Full text ≥500 chars: +15, ≥50 chars: +5, <50 chars: −5
- URL confirmed dead (4xx/5xx): −10

**`publisher_trust_score`** (0–10): trust tier weight, independent of data quality.
primary=10, curated=9, high=8, medium=6, low=3, unknown=2

**Hard gates** (score = 0, label = `do_not_use`):
- Missing or empty title
- Missing, unsafe, or HTTP URL that does not redirect to HTTPS

`credibility_label` is derived from structural_validity_score alone:
≥80 → `primary`, ≥65 → `high_trust`, ≥45 → `medium_trust`, ≥25 → `low_trust`, <25 → `do_not_use`

**Key change**: trust tier no longer compensates for missing structural data. A primary-tier source with a missing title is `do_not_use` — the data record is incomplete regardless of the publisher.

---

## Eligibility flags

`computeEligibilityFlags` (`lib/sources/eligibilityFlags.js`) computes seven boolean flags for each source:

| Flag | Condition |
|---|---|
| `eligible_for_daily_report` | `date_published` is within the current daily window AND `date_confidence` is not `"none"` |
| `eligible_for_weekly_report` | `date_published` is within 7 days AND `date_confidence` is not `"none"` |
| `eligible_for_monthly_report` | `date_published` is within 30 days AND `date_confidence` is not `"none"` |
| `eligible_for_archive` | Always `true` — every validated source is archived |
| `eligible_for_trend_analysis` | `full_text` length > 200 chars (LLM needs enough text to work with) |
| `eligible_for_reference_context` | `trust_tier` is `curated`, `primary`, or `high` |
| `needs_review` | `date_confidence` is `"none"` or `"low"`, source_type is `unknown`, publisher is missing, or date is missing |

LLM Discovery sources carry a pre-computed `eligible_for_daily_report` in their collection_metadata (based on whether the inferred date is < 48 hours old). This takes precedence over the window-based calculation.

---

## Event clustering (scaffolding)

The following fields are added to every source row but are not yet populated by any pipeline step. They are reserved for a future event clustering pass that will group coverage of the same incident across multiple sources:

- `event_cluster_id` — UUID linking sources about the same event
- `cluster_key` — normalised event fingerprint (e.g. CVE ID + actor)
- `is_primary_source` — true if this source is the authoritative origin (CISA advisory > news summary)
- `is_follow_on_source` — true if this source is a secondary report or commentary
- `adds_new_information` — true if this source adds new facts beyond the cluster's existing coverage
- `related_sources` — array of source IDs in the same cluster

---

## What comes out

A flat array of normalised source objects, each with:
- **Identity**: id, url, title, publisher, author
- **Temporal**: date_published, date_published_actual, date_discovered, date_confidence, date_collected
- **Content**: full_text, summary, raw_html
- **Classification seeds**: trust_tier, source_type, tags (initial phrase-based)
- **Validity**: validity.structural_validity_score, validity.publisher_trust_score, validity.credibility_label, validity.url_safety_status, validity.final_url, validity.url_reachable
- **Eligibility**: eligible_for_daily_report, eligible_for_weekly_report, eligible_for_monthly_report, eligible_for_archive, eligible_for_trend_analysis, eligible_for_reference_context, needs_review
- **Clustering** (empty): event_cluster_id, cluster_key, is_primary_source, is_follow_on_source, adds_new_information, related_sources
- **Integrity**: content_hash, clean_text_hash

These then pass sequentially through: cleaning → window filter → deduplication → source type filter → validity check → eligibility flags → initial tagging → archiving → database storage.
