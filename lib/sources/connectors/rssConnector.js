import { normalizeSource } from "../normalizeSource.js";

function getTag(item, tag) {
  return (
    item.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1] ||
    item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ||
    ""
  ).trim();
}

function cleanXmlText(text = "") {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchRssSources(feed) {
  const res = await fetch(feed.url);
  if (!res.ok) throw new Error(`${feed.name} RSS failed: ${res.status}`);

  const xml = await res.text();
  const items = xml.split("<item>").slice(1, feed.limit || 8);

  return items.map((item) =>
    normalizeSource({
      title: cleanXmlText(getTag(item, "title")),
      url: getTag(item, "link"),
      publisher: feed.publisher,
      author: feed.publisher,
      date_published: getTag(item, "pubDate"),
      source_type: feed.source_type || "security_blog",
      full_text: cleanXmlText(getTag(item, "description")),
      raw_html: item,
    })
  );
}
