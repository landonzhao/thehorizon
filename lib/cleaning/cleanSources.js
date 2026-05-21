import { cleanText } from "./cleanText.js";
import { cleanPlaintext } from "./cleanPlaintext.js";

export function cleanSources(sources) {
  return sources.map((source) => ({
    ...source,
    title: cleanText(source.title),
    publisher: cleanText(source.publisher),
    author: cleanText(source.author),
    // summary and full_text may contain HTML, markdown, and RSS boilerplate
    summary: source.summary ? cleanPlaintext(source.summary) : source.summary,
    full_text: source.full_text ? cleanPlaintext(source.full_text) : source.full_text,
  }));
}
