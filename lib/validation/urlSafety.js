export function isSafeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") return false;

    const host = url.hostname.toLowerCase();

    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    const privateIPv4 =
      /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;

    if (privateIPv4.test(host)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a URL responds with a success status.
 * Returns true (reachable), false (confirmed error response), or null (could not determine — timeout or network error).
 * Uses a HEAD request; falls back to treating 405 (Method Not Allowed) as reachable since the server is alive.
 */
export async function isUrlReachable(url, timeoutMs = 3000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "the-horizon-ingester/0.1" },
      redirect: "follow",
    });
    clearTimeout(timer);
    // 405 = server alive but HEAD not supported — treat as reachable
    return res.ok || res.status === 405;
  } catch {
    return null;
  }
}
