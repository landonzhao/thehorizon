import { normalizeSource } from "../normalizeSource.js";

export async function fetchIncidentDatabaseSources() {
  const url = "https://incidentdatabase.ai/";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "the-horizon-ingester",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`AI Incident Database fetch failed: ${res.status}`);
  }

  const html = await res.text();

  return [
    normalizeSource({
      title: "AI Incident Database",
      url,
      publisher: "AI Incident Database",
      author: "AI Incident Database",
      date_published: "",
      source_type: "incident_database",
      full_text:
        "Reference source for real-world AI incidents and harms. Use for later incident trend enrichment rather than direct daily news intake.",
      raw_html: html.slice(0, 5000),
    }),
  ];
}
