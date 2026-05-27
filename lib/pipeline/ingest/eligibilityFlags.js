const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_SCAN_DAYS = 365;

function isWithinWindowBounds(datePublished, window) {
  if (!datePublished || !window?.start_utc || !window?.end_utc) return false;
  const date = new Date(datePublished).getTime();
  if (isNaN(date)) return false;
  return date >= new Date(window.start_utc).getTime() &&
    date < new Date(window.end_utc).getTime();
}

function isWithinDays(datePublished, days) {
  if (!datePublished) return false;
  const pub = new Date(datePublished).getTime();
  if (isNaN(pub)) return false;
  return Date.now() - pub < days * DAY_MS;
}

/**
 * Compute eligibility flags for a source, given the current ingestion window.
 * These flags determine which report windows a source qualifies for and whether
 * it needs manual review before being surfaced to analysts.
 */
export function computeEligibilityFlags(source, window = null) {
  const dateConf = source.date_confidence ||
    source.collection_metadata?.date_confidence ||
    "exact";

  const datePub = source.date_published;
  const trust = source.trust_tier;
  const sourceType = source.source_type;

  // For LLM Discovery sources, eligible_for_daily_report was pre-computed based on
  // whether the inferred date is recent. Respect that if set.
  const precomputed = source.collection_metadata?.eligible_for_daily_report;

  // daily: must fall inside the current window AND have a reliable date.
  // Sources with date_confidence "none" or "low" were not published "today" in any
  // verifiable sense, so they stay out of the daily report.
  const eligible_for_daily_report = precomputed !== undefined
    ? Boolean(precomputed)
    : (Boolean(datePub) &&
       dateConf !== "none" &&
       (window ? isWithinWindowBounds(datePub, window) : isWithinDays(datePub, 1)));

  // weekly: within the last 7 days with any non-zero date confidence.
  const eligible_for_weekly_report = Boolean(datePub) &&
    dateConf !== "none" &&
    isWithinDays(datePub, 7);

  // monthly: within 30 days. Looser date requirement — "estimated" dates are OK.
  const eligible_for_monthly_report = Boolean(datePub) &&
    dateConf !== "none" &&
    isWithinDays(datePub, 30);

  // horizon_scan: within 12 months. Feeds the annual horizon scan pipeline.
  const eligible_for_horizon_scan = Boolean(datePub) &&
    dateConf !== "none" &&
    isWithinDays(datePub, HORIZON_SCAN_DAYS);

  // archive: every validated source goes to the archive regardless of date.
  const eligible_for_archive = true;

  // trend analysis: needs enough text for the LLM to work with.
  const eligible_for_trend_analysis = (source.full_text?.length || 0) > 200;

  // reference context: high-quality permanent sources that analysts treat as references.
  const eligible_for_reference_context = ["curated", "primary", "high"].includes(trust);

  // needs_review: low-confidence date, unknown source type, or incomplete key fields.
  const needs_review = (
    dateConf === "none" ||
    dateConf === "low" ||
    sourceType === "unknown" ||
    !source.publisher ||
    !datePub
  );

  return {
    eligible_for_daily_report,
    eligible_for_weekly_report,
    eligible_for_monthly_report,
    eligible_for_horizon_scan,
    eligible_for_archive,
    eligible_for_trend_analysis,
    eligible_for_reference_context,
    needs_review,
  };
}
