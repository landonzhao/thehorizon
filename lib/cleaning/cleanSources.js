import { cleanText } from "./cleanText.js";

export function cleanSources(sources) {
  return sources.map((source) => ({
    ...source,
    title: cleanText(source.title),
    publisher: cleanText(source.publisher),
    author: cleanText(source.author),
    full_text: cleanText(source.full_text),
  }));
}
