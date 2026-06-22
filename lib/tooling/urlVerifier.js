/**
 * URL verifier for the agentic tooling pipeline.
 *
 * Every URL stored in atool_tools is HEAD-checked before persistence so the
 * corpus never contains broken links. This is one of the three pillars of the
 * no-hallucination guarantee (along with README-grounded descriptions and the
 * deterministic relevance gate).
 *
 * verifyUrl(url) → { ok, status, finalUrl, redirected, error }
 * verifyUrls(urls) → map of url → result (concurrent, capped)
 */

const TIMEOUT_MS  = 8000;
const CONCURRENCY = 6;

// Headers that mimic a real browser enough to pass bot-checks on most sites.
const HEADERS = {
  "User-Agent":      "Mozilla/5.0 (compatible; HorizonScanBot/1.0; +https://github.com)",
  "Accept":          "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Verify a single URL. Follows redirects (max 5 hops). Returns the final URL
 * so callers can detect domain-switches (e.g. a GitHub repo → parked domain).
 *
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status: number|null, finalUrl: string, redirected: boolean, error: string|null }>}
 */
export async function verifyUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return { ok: false, status: null, finalUrl: url, redirected: false, error: "invalid_url" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method:   "HEAD",
      redirect: "follow",
      headers:  HEADERS,
      signal:   controller.signal,
    });
    clearTimeout(timer);
    const finalUrl   = res.url || url;
    const redirected = finalUrl !== url;
    const ok         = res.status >= 200 && res.status < 400;
    return { ok, status: res.status, finalUrl, redirected, error: null };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") return { ok: false, status: null, finalUrl: url, redirected: false, error: "timeout" };
    // Some servers block HEAD — retry with GET (range 0–0) as a fallback
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);
      const res2 = await fetch(url, {
        method:  "GET",
        headers: { ...HEADERS, Range: "bytes=0-0" },
        signal:  controller2.signal,
        redirect: "follow",
      });
      clearTimeout(timer2);
      const finalUrl   = res2.url || url;
      const ok         = res2.status >= 200 && res2.status < 400;
      return { ok, status: res2.status, finalUrl, redirected: finalUrl !== url, error: null };
    } catch (err2) {
      clearTimeout(timer);
      return { ok: false, status: null, finalUrl: url, redirected: false, error: err2.message?.slice(0, 80) };
    }
  }
}

/**
 * Verify a list of URLs concurrently (capped at CONCURRENCY).
 *
 * @param {string[]} urls
 * @returns {Promise<Map<string, object>>}
 */
export async function verifyUrls(urls) {
  const results = new Map();
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(u => verifyUrl(u)));
    settled.forEach((r, j) => {
      results.set(batch[j], r.status === "fulfilled" ? r.value : { ok: false, status: null, finalUrl: batch[j], redirected: false, error: r.reason?.message });
    });
  }
  return results;
}

/**
 * Check whether a URL is a live GitHub repo (not 404, not archived-only).
 * Returns the normalised https URL or null if not reachable.
 */
export async function verifyGithubRepo(url) {
  if (!url) return null;
  const normalised = url.replace(/\.git$/, "").replace(/\/$/, "");
  const { ok, status } = await verifyUrl(normalised);
  if (!ok || status === 404) return null;
  return normalised;
}
