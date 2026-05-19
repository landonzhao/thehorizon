import { fetchRssSources } from "./rssConnector.js";

export async function fetchOwaspSources() {
  return fetchRssSources({
    name: "OWASP",
    publisher: "OWASP",
    url: "https://owasp.org/feed.xml",
    source_type: "security_framework",
    limit: 10,
  });
}
