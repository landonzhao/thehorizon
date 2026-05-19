import { normalizeSource } from "../normalizeSource.js";

export async function fetchMitreAtlasSources() {
  const url =
    "https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.json";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MITRE ATLAS fetch failed: ${res.status}`);
  }

  const data = await res.json();

  const objects = data.objects || [];

  return objects
    .filter((obj) => ["attack-pattern", "course-of-action", "x-mitre-case-study"].includes(obj.type))
    .slice(0, 30)
    .map((obj) =>
      normalizeSource({
        title: obj.name || obj.id,
        url: "https://atlas.mitre.org/",
        publisher: "MITRE ATLAS",
        author: "MITRE",
        date_published: obj.created || "",
        source_type: "ai_threat_framework",
        full_text: obj.description || "",
        raw_html: JSON.stringify(obj),
      })
    );
}
