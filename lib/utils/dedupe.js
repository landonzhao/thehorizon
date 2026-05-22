const REMOVABLE_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "source", "mc_cid", "mc_eid",
  "mkt_tok", "_hsenc", "_hsmi", "hsCtaTracking",
]);

function canonicalUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const param of [...url.searchParams.keys()]) {
      if (REMOVABLE_PARAMS.has(param)) url.searchParams.delete(param);
    }
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return rawUrl.toLowerCase().trim();
  }
}

function normaliseTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TIER_PRIORITY = { primary: 0, high: 1, curated: 2, medium: 3, low: 4, unknown: 5 };

export function dedupeSources(sources) {
  // Sort so highest-trust sources win when title or content collides across feeds
  const sorted = [...sources].sort(
    (a, b) => (TIER_PRIORITY[a.trust_tier] ?? 5) - (TIER_PRIORITY[b.trust_tier] ?? 5)
  );

  const seenUrls = new Set();
  const seenTitles = new Set();
  const seenContentHashes = new Set();

  return sorted.filter((source) => {
    const urlKey = canonicalUrl(source.url);
    const titleKey = normaliseTitle(source.title);
    // Only use content hash when there is enough text to be meaningful
    const hashKey = source.clean_text_hash && (source.full_text?.length ?? 0) > 200
      ? source.clean_text_hash
      : null;

    if (urlKey && seenUrls.has(urlKey)) return false;
    if (titleKey && seenTitles.has(titleKey)) return false;
    if (hashKey && seenContentHashes.has(hashKey)) return false;

    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    if (hashKey) seenContentHashes.add(hashKey);

    return true;
  });
}
