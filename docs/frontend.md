# Frontend Reference

The frontend is a single-page React app (React 19 + Vite) in /src. There is no router — page state is managed with a single useState("page") in App.jsx. The default landing page is Report.


## File Structure

```
src/
  App.jsx              — root component: mounts Nav and the active page
  constants.js         — MAIN_CATEGORY_ORDER, ARCHIVE_CATEGORY_ORDER, CATEGORY_LABELS,
                         CATEGORY_DESCRIPTIONS, REPORT_PERIOD_DAYS
  utils.js             — formatLabel, formatDate, getCredibilityLabel, getCategory,
                         sortByPriority, sortByPublishDate, groupByCategory
  style.css            — all styles
  components/
    SourceCard.jsx     — TagList, SourceCard
    CategorySection.jsx — FeaturedTopThree, CategorySection, CategoryDetail
    Nav.jsx            — top navigation bar
  pages/
    ReportPage.jsx     — StatPill, TopDevelopmentCard, ReportCategorySection, ReportPage
    SourcePage.jsx     — SourcePage (daily / weekly / monthly / quarterly tabs)
    ArchivePage.jsx    — ArchivePage
```

All shared data (category labels, ordering) lives in constants.js. All formatting and grouping logic lives in utils.js. Neither file imports React — they are pure JS modules.


## Pages

The nav has six tabs: Report, Daily, Weekly, Monthly, Quarterly, Archive.

### Report (ReportPage)

File: src/pages/ReportPage.jsx

Calls GET /api/generate-report?period={period} where period is weekly/monthly/quarterly, controlled by tabs in the hero header. Defaults to monthly on load.

Renders:
- Stats row: total sources, tier breakdown (core/adjacent), per-category counts, emerging threat count
- Top Developments: ranked list of up to 8 sources by report_score
- Emerging Threats: sources with threat_maturity emerging/growing (only appears with LLM enrichment)
- Trend Signals: forward-looking signals from intelligence.trend_signals (only with LLM enrichment)
- Category Breakdown: all five threat categories, each with top sources listed; expandable to show more
- Key Entities: aggregated threat actors, tools/techniques, CVEs (only with LLM enrichment)
- Footer note: generated timestamp, enrichment count

This is the primary output surface of the platform.


### Daily / Weekly / Monthly / Quarterly (SourcePage)

File: src/pages/SourcePage.jsx

Calls /api/sources (daily) or /api/period-sources?period={period} (others).

Shows source cards grouped by the five threat categories. Each category shows the top 3 sources as FeaturedTopThree cards, with a "View all" button that loads CategoryDetail showing all sources in a grid.

This is a raw source browser, not a structured report. Sources are ranked by priority_score.


### Archive (ArchivePage)

File: src/pages/ArchivePage.jsx

Calls /api/archive-sources with filter parameters: date range, publisher substring, source_type, tag. Preset buttons for "last 7/30/90 days". Filters are applied on demand via "Apply Filters" button.

Shows all matching sources grouped by category, sorted by date_published. Intended for historical browsing and research.


## Components

**SourceCard** (src/components/SourceCard.jsx)
Displays a single source. Shows source_type, priority label + score, title, publisher + date, priority_reason, a text excerpt (short_summary → summary → full_text, truncated), tags, credibility label, and a link to the original URL. The `featured` prop increases the text truncation limit and applies a larger card style.

**TagList** (src/components/SourceCard.jsx)
Inline list of up to 10 tags, rendered as styled chips. Deduplicates and filters empty values.

**FeaturedTopThree** (src/components/CategorySection.jsx)
Lays out 1, 2, or 3 SourceCards in a responsive grid. The first card is always featured. Used inside CategorySection.

**CategorySection** (src/components/CategorySection.jsx)
A full category panel: header with label, description, source count, and "View all" button; followed by FeaturedTopThree. Clicking "View all" triggers the onViewAll callback with the category key, which SourcePage uses to switch to CategoryDetail.

**CategoryDetail** (src/components/CategorySection.jsx)
Full-page category view showing all sources in a grid. Has a "Back to overview" button.

**Nav** (src/components/Nav.jsx)
Top navigation bar with The Horizon brand and tab buttons for all six pages.

**TopDevelopmentCard** (src/pages/ReportPage.jsx)
Ranked card for the report page. Shows rank number, category label, title link, publisher/date, short_summary, why_it_matters, report_score badge, and priority label.

**ReportCategorySection** (src/pages/ReportPage.jsx)
Compact category section for the report view. Shows sources as a list (title link, publisher, date, score, tags) rather than full cards. Expandable to show more than the initial 3.

**StatPill** (src/pages/ReportPage.jsx)
Small metric chip used in the report stats row. Optional `highlight` prop adds a visual accent.


## Styling

style.css uses CSS custom properties for the dark color scheme. Background is #070b12 with radial gradient overlays. All panels use background: rgba(15, 23, 42, 0.72) with border: 1px solid #1e293b and border-radius between 18px and 30px.

Priority labels map to color classes: critical (red tint), high (amber), medium (blue), low/background (grey).

Maturity tags (emerging/growing/established/declining) have their own color classes.

The layout is max-width 1240px centered. Responsive breakpoint at 900px collapses multi-column grids to single column.


## Data Flow

The frontend never writes to the database. All data flows are read-only fetches to API endpoints. The enrichment state of sources (whether LLM enrichment ran) affects which sections of the Report page render — sections with no data are hidden rather than showing empty states.

There is no authentication on the frontend. The generate-report endpoint is public. The source/archive endpoints have no auth. Only the admin/mutation endpoints (classify, score, refresh, purge) require CRON_SECRET.
