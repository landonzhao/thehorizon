import { normalizeSource } from "../normalizeSource.js";

export async function fetchNvdSources(options = {}) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const pubStartDate = encodeURIComponent(yesterday.toISOString());
  const pubEndDate = encodeURIComponent(now.toISOString());

  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=AI&pubStartDate=${pubStartDate}&pubEndDate=${pubEndDate}`;

  const res = await fetch(url, {
    signal: options.signal,
    headers: {
      "User-Agent": "the-horizon-ingester/0.1",
    },
  });

  if (!res.ok) throw new Error(`NVD fetch failed: ${res.status}`);

  const data = await res.json();

  return (data.vulnerabilities || []).map((entry) => {
    const cve = entry.cve;
    const cveId = cve.id;

    return normalizeSource({
      title: `${cveId}: ${cve.descriptions?.[0]?.value?.slice(0, 140) || "NVD CVE"}`,
      url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
      publisher: "NVD",
      author: "NIST",
      date_published: cve.published,
      source_type: "vulnerability_database",
      full_text: cve.descriptions?.[0]?.value || "",
      trust_tier: "primary",
      collection_metadata: {
        connector_name: "NVD",
        retrieval_method: "official_api",
        trust_tier: "primary",
        collected_at: new Date().toISOString(),
      },
    });
  });
}
