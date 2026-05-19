import { normalizeSource } from "../normalizeSource.js";

export async function fetchCisaSources() {
  const url = "https://www.cisa.gov/cybersecurity-advisories/all.xml";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CISA fetch failed: ${res.status}`);

  const xml = await res.text();
  const items = xml.split("<item>").slice(1, 11);

  return items.map((item) => {
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
      item.match(/<title>(.*?)<\/title>/)?.[1] ||
      "";

    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const description =
      item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
      item.match(/<description>(.*?)<\/description>/)?.[1] ||
      "";

    return normalizeSource({
      title,
      url: link,
      publisher: "CISA",
      author: "CISA",
      date_published: pubDate,
      source_type: "government_advisory",
      full_text: description,
      raw_html: item,
    });
  });
}
