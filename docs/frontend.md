# Frontend Reference

The frontend is a single-page React app (React 19 + Vite) in /src. It has one component file (App.jsx) and one stylesheet (style.css). There is no router — page state is managed with a single useState("page") in the App component.


## Pages

The nav has six tabs: Report, Daily, Weekly, Monthly, Quarterly, Archive. The default landing page is Report.

### Report (ReportPage component)

Calls GET /api/generate-report?period={period} where period is weekly/monthly/quarterly, controlled by tabs in the hero header.

Renders:
- Stats row: total sources, tier breakdown, per-category counts
- Top Developments: ranked list of up to 8 sources by report_score
- Emerging Threats: sources with threat_maturity emerging/growing (only appears with LLM enrichment)
- Trend Signals: forward-looking signals extracted from intelligence.trend_signals (only with LLM enrichment)
- Category Breakdown: all six categories, each with top sources listed; expandable to show more
- Key Entities: aggregated threat actors, tools/techniques, CVEs (only with LLM enrichment)
- Footer note: generated timestamp, enrichment count

This is the primary output surface of the platform.


### Daily / Weekly / Monthly / Quarterly (SourcePage component)

Calls /api/sources (daily) or /api/period-sources?period={period} (others).

Shows source cards grouped by the five threat categories. Each category shows the top 3 sources as FeaturedTopThree cards, with a "View all" button that loads CategoryDetail showing all sources in a grid.

This is a raw source browser, not a structured report. Sources are ranked by priority_score.


### Archive (ArchivePage component)

Calls /api/archive-sources with filter parameters: date range, publisher substring, source_type, tag. Preset buttons for "last 7/30/90 days".

Shows all matching sources grouped by category, sorted by date_published. Intended for historical browsing and research.


## Key Components

SourceCard — displays a single source. Shows source_type, priority label + score, title, publisher + date, priority_reason, a text excerpt (short_summary or full_text), tags, credibility label, and a link to the original URL.

FeaturedTopThree — lays out 1, 2, or 3 cards in a responsive grid. The first card is "featured" (larger title, more text).

CategorySection — a category panel with header, description, FeaturedTopThree, and a "View all" button.

TopDevelopmentCard (report page) — a ranked card with title link, publisher/date, short_summary, why_it_matters, and score badge.

ReportCategorySection — category section for the report view. Shows sources as a compact list (title link, publisher, date, score, tags) rather than full cards. Expandable.

StatPill — small metric chip used in the report stats row.


## Styling

style.css uses CSS custom properties for the dark color scheme. Background is #070b12 with radial gradient overlays. All panels use background: rgba(15, 23, 42, 0.72) with border: 1px solid #1e293b and border-radius between 18px and 30px.

Priority labels map to color classes: critical (red tint), high (amber), medium (blue), low/background (grey).

Maturity tags (emerging/growing/established/declining) have their own color classes.

The layout is max-width 1240px centered. Responsive breakpoint at 900px collapses multi-column grids to single column.


## Data Flow to Frontend

The frontend never writes to the database. All data flows are read-only fetches to API endpoints. The enrichment state of sources (whether Gemini ran) affects which sections of the Report page render, but the page degrades gracefully — sections with no data are hidden rather than showing empty states.

There is no authentication on the frontend. The generate-report endpoint is public. The source/archive endpoints have no auth. Only the admin/mutation endpoints (classify, score, refresh, purge) require CRON_SECRET.
