function canonicalUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);

    url.hash = "";

    const removableParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];

    for (const param of removableParams) {
      url.searchParams.delete(param);
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

export function dedupeSources(sources) {
  const seenUrls = new Set();
  const seenTitles = new Set();

  return sources.filter((source) => {
    const urlKey = canonicalUrl(source.url);
    const titleKey = normaliseTitle(source.title);

    if (urlKey && seenUrls.has(urlKey)) return false;
    if (titleKey && seenTitles.has(titleKey)) return false;

    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);

    return true;
  });
}
