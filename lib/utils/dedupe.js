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
    const urlKey = source.url?.toLowerCase().replace(/\/$/, "");
    const titleKey = normaliseTitle(source.title);

    if (urlKey && seenUrls.has(urlKey)) return false;
    if (titleKey && seenTitles.has(titleKey)) return false;

    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);

    return true;
  });
}
