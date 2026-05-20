# The Horizon — Project Context

The Horizon is an AI threat intelligence and horizon scanning platform. It ingests sources from RSS feeds, academic databases, and threat intelligence APIs, classifies and scores them for relevance to the AI threat landscape, and generates structured reports for analysts.

The intended audience is cybersecurity professionals, policy analysts, and decision-makers tracking AI-enabled threats, LLM vulnerabilities, agentic AI risks, and adversarial ML.


## Tech Stack

- Frontend: React 19 + Vite, served as a static SPA
- Backend: Vercel serverless functions in /api (Node.js ESM)
- Database: Supabase (PostgreSQL) via @supabase/supabase-js with service role key
- File storage: Vercel Blob for snapshot JSON archives
- LLM enrichment: OpenAI (primary, gpt-4o-mini) or Gemini (fallback, gemini-2.5-flash)
- Deployment: Vercel Hobby plan (12 serverless function limit)
- Scheduling: Vercel cron — /api/refresh runs daily at 22:00 UTC (06:00 SGT next day)


## Environment Variables

SUPABASE_URL — Supabase project URL
SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses row-level security)
BLOB_READ_WRITE_TOKEN — Vercel Blob token for snapshot archives
CRON_SECRET — bearer token required for all admin/mutation API endpoints
OPENAI_API_KEY — used for source enrichment (gpt-4o-mini); primary LLM
GEMINI_API_KEY — fallback LLM (gemini-2.5-flash); free tier is 20 req/day


## Repository Structure

/api — Vercel serverless function handlers (one file = one endpoint)
/lib — all business logic, imported by API handlers and scripts
  /lib/sources — ingestion: connectors, registry, normalization, filtering
  /lib/cleaning — text cleaning utilities
  /lib/classification — tagging, categorization, AI specificity scoring
  /lib/claims — LLM enrichment: enrichSource.js (OpenAI primary / Gemini fallback), validateClaims.js, processSourceClaims.js
  /lib/scoring — priority and report scoring
  /lib/reports — report generation logic
  /lib/storage — Supabase client, snapshot persistence, Vercel Blob
  /lib/archive — local JSON archive writing (dev only, gracefully skipped on Vercel)
  /lib/time — reporting window calculations (SGT-anchored)
  /lib/utils — deduplication
  /lib/validation — source validity checks, URL safety
/scripts — local Node.js scripts for operations that exceed Vercel's timeout
/src — React frontend
  /src/constants.js — category labels, ordering, period day counts
  /src/utils.js — formatting and grouping helpers
  /src/components — SourceCard.jsx, CategorySection.jsx, Nav.jsx
  /src/pages — ReportPage.jsx, SourcePage.jsx, ArchivePage.jsx
  /src/App.jsx — root component (routing only)
  /src/style.css — all styles
/public — static assets


## The Pipeline (High Level)

Ingestion -> Cleaning -> Dedup -> Validation -> Tagging -> Snapshot -> Classify -> Score -> Report

Each stage is documented in detail in docs/pipeline.md.
Each API endpoint is documented in docs/api.md.


## Supabase Tables

sources — one row per unique source article. Primary key is a URL-derived sha256 hash (first 36 chars), which means re-ingesting the same URL upserts rather than duplicates.

snapshots — one row per ingestion run, keyed by snapshot_id (format: snapshot-YYYY-MM-DD). Stores metadata and a blob_path pointing to the full JSON in Vercel Blob.

ingestion_runs — audit log of every /api/refresh call. Records status, timing, source counts, and connector results.

Key columns on sources:
- id (text, primary key) — URL sha256 hash or crypto.randomUUID() fallback
- title, url, publisher, author, date_published, source_type, full_text, summary
- trust_tier — primary/high/medium/low/curated/unknown
- tags (text[]) — array of allowed tag strings
- main_category — one of the five threat categories or "uncategorised"
- ai_specificity_score (0-100) — how AI-specific the content is
- relevance_tier — core (>=40), adjacent (20-39), context (10-19); off_topic deleted
- priority_score — composite score for dashboard ranking
- report_score — composite score for report inclusion ranking
- intelligence (jsonb) — Gemini/OpenAI extracted fields: trend_signals, key_entities, threat_maturity, sector_impact, horizon_relevance, report_tier
- short_summary, analyst_brief — LLM-generated summaries
- claim_extraction_status — null or "success"; indicates whether LLM enrichment ran


## Threat Categories

traditional_ai_threats — attacks on ML models: data poisoning, model extraction, evasion, backdoors, adversarial examples
llm_threats — LLM-specific: prompt injection, jailbreaks, RAG poisoning, data leakage, guardrail bypass
agentic_ai_threats — AI agents and tool use: MCP risks, autonomous agent abuse, coding agent vulnerabilities
ai_enabled_threats — AI as an attack tool: deepfakes, AI phishing, AI malware, voice cloning, disinformation
ai_for_security — defensive use: SOC automation, AI vulnerability detection, secure development


## Source Trust Tiers

primary — government agencies (CISA, NCSC, CSA, NIST), AI labs (Anthropic, OpenAI)
high — established security vendors (Google, Microsoft), academic, reputable blogs
medium — general security news outlets
curated — manually imported sources from the Excel backlog; never deleted by purge
low — lower-confidence sources
unknown — trust tier not determined


## Key Design Decisions

Source IDs are derived from URL sha256 hashes. This means the same article always gets the same ID, so Supabase upsert on conflict:id naturally deduplicates across multiple ingestion runs.

The classification pipeline never hard-deletes curated sources (trust_tier = "curated"). They are protected from the ai_specificity_score < 10 purge threshold.

LLM enrichment (OpenAI/Gemini) is optional. The pipeline runs fully on rule-based classification if no API keys are available. LLM enrichment adds short_summary, analyst_brief, intelligence metadata, and more accurate ai_specificity_score, but is not required for the pipeline to function.

arXiv is the most important API source for research coverage. It runs 6 targeted queries for different AI security subtopics. It rate-limits aggressively — the backfill script adds 8s between weekly chunks and 3s between queries within a chunk.

The Vercel Hobby plan caps at 12 serverless functions. Current count is exactly 12. Adding any new /api file will require removing an existing one or upgrading the plan.

The daily cron runs at 22:00 UTC which is 06:00 SGT the next day. The reporting window is anchored to 06:00 SGT boundaries, so each day's window covers 06:00 SGT yesterday to 06:00 SGT today.


## Local Development

npm run dev — starts Vite dev server on :5173 (frontend only)
npx vercel dev — starts full local environment with API functions on :3000 (use this)

Scripts that must be run locally (Vercel timeout is 10s for most operations):
- node scripts/backfillSources.js [start] [end] [connectors] — historical ingestion
- node scripts/enrichSources.js [limit] [delay_ms] — LLM enrichment of stored sources; requires OPENAI_API_KEY or GEMINI_API_KEY; default delay 7000ms (Gemini free tier), use 500ms or less with OpenAI
- node scripts/importCuratedExcel.js — import curated sources from imports/ Excel file

After backfill, run in order:
1. POST /api/classify-sources?limit=1000 (repeat 2-3x until stable)
2. POST /api/score-sources?limit=1000
3. GET /api/generate-report?period=monthly
