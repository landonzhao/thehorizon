import { MAIN_CATEGORY_ORDER, ARCHIVE_CATEGORY_ORDER } from "./constants.js";

export function formatLabel(value = "") {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function getCredibilityLabel(source) {
  return source.validity?.credibility_label || source.credibility_label || "unknown";
}

export function getCategory(source) {
  return source.main_category || "uncategorised";
}

export function sortByPriority(sources = []) {
  return [...sources].sort((a, b) => {
    const scoreDiff = (b.priority_score || 0) - (a.priority_score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.date_published || 0) - new Date(a.date_published || 0);
  });
}

export function sortByPublishDate(sources = []) {
  return [...sources].sort(
    (a, b) => new Date(b.date_published || 0) - new Date(a.date_published || 0)
  );
}

export function groupByCategory(sources = [], mode = "priority") {
  const order = mode === "archive" ? ARCHIVE_CATEGORY_ORDER : MAIN_CATEGORY_ORDER;
  const groups = Object.fromEntries(order.map((category) => [category, []]));

  for (const source of sources) {
    const category = getCategory(source);
    const safeCategory = groups[category] ? category : "uncategorised";
    if (!groups[safeCategory]) groups[safeCategory] = [];
    groups[safeCategory].push(source);
  }

  for (const category of Object.keys(groups)) {
    groups[category] =
      mode === "archive" ? sortByPublishDate(groups[category]) : sortByPriority(groups[category]);
  }

  return groups;
}
