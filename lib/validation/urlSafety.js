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
