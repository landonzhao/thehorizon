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

Seven targeted queries against the arXiv API, each covering a distinct AI threat category:
- LLM jailbreaks and prompt injection
- LLM and foundation model security
- AI-enabled attacks (deepfakes, disinformation, voice cloning)
- Traditional ML model attacks (poisoning, extraction, evasion, backdoors)
- Agentic AI and autonomous system security
- MCP, tool use, RAG, and LLM plugin security
- AI safety and alignment with security implications

Queries use title-based matching (`ti:`) against `cs.CR` and `cs.AI`. Title matching is intentional — abstract matching is too broad and pulls in papers that only tangentially mention security.

A 5-second delay runs between each query to stay within arXiv's rate limits. On 429 or 503 responses, the connector retries up to 3 times with exponential backoff.

Trust tier: `high` (arXiv is an academic institution).

### 3. NVD (National Vulnerability Database)

Fetches CVEs published within the current window using `keywordSearch=artificial intelligence`. Because NVD does substring matching, a post-fetch filter checks each CVE description for AI-relevant terms (artificial intelligence, machine learning, large language model, neural network, deep learning, generative AI, chatbot). Only CVEs passing this check are kept.

This connector catches AI-related CVEs same-day, before CISA advisories that often lag by days.

### 4. LLM Discovery — `gemini-2.5-flash` + `GEMINI_API_KEY`

Uses Gemini 2.5 Flash with **Google Search grounding** to surface URLs that structured feeds miss — particularly agentic AI attacks, MCP risks, and emerging techniques that haven't reached major outlets yet.

Four prompts run **sequentially** (not in parallel) because Gemini's free tier allows only 10 requests per minute. A 7-second delay between prompts keeps the connector under that limit. The four queries cover:
- Agentic AI security and coding assistant vulnerabilities
- MCP server security
- Prompt injection in coding tools
- AI threat landscape (nation-state use, AI malware, deepfake fraud)

Grounding chunks — the Google-verified URIs Gemini cited — become the discovered sources. **The date for all LLM-discovered sources is set to the time of collection** (not the article's actual publication date). This is intentional: Gemini is asked to find "recent 2025–2026" content, but URL dates may be months old. Using collection time ensures these sources pass the window filter and get ingested.

**This connector is skipped entirely if `GEMINI_API_KEY` is not set.**

---

## Normalisation

Every source, regardless of connector, passes through `normalizeSource` before entering the pipeline:

- **ID**: SHA256 hash of the URL (first 36 chars). The same article always gets the same ID. Re-ingesting the same URL upserts rather than duplicates.
- **URL**: arXiv HTTP URLs are upgraded to HTTPS. All other URLs are used as-is.
- **Text**: `full_text`, `title`, and `summary` all run through `cleanPlaintext` at normalisation time.
- **Date**: Invalid or missing dates are set to `null` (the source then fails the window filter and is discarded).
- **Trust tier**: Inherited from the connector's registry entry or hardcoded collection metadata.
- **Content hash**: SHA256 of `title|url|full_text` — used to detect identical content arriving from different sources.

---

## Why parallel execution

All connectors run in `Promise.all`. The daily window and normalisation constraints are the same for every connector, and there are no dependencies between them. Parallel execution keeps total ingestion time close to the slowest connector's timeout rather than the sum of all timeouts. On a tight Vercel execution budget, this is essential.

---

## What comes out

A flat array of normalised source objects, each with:
- Identity fields: id, url, title, publisher, author
- Temporal fields: date_published, date_collected
- Content fields: full_text, summary, raw_html
- Classification seeds: trust_tier, source_type
- Integrity: content_hash, clean_text_hash

These then pass sequentially through: cleaning → window filter → deduplication → source type filter → validity check → initial tagging → archiving → database storage.
