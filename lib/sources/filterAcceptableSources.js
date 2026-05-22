const ACCEPTED_SOURCE_TYPES = new Set([
  "news",
  "vendor_advisory",
  "security_blog",
  "government_advisory",
  "policy_update",
  "threat_intel",
  "research_paper",
  "security_framework",
  "ai_lab_update",
  "vulnerability_database",
]);

const REJECTED_SOURCE_TYPES = new Set([
  "open_source_project",
  "social_signal",
  "ai_threat_framework",
  "incident_database",
]);

export function filterAcceptableSources(sources) {
  const accepted = [];
  const rejected = [];

  for (const source of sources) {
    const reason = getRejectionReason(source);

    if (reason) {
      rejected.push({
        id: source.id,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        source_type: source.source_type,
        reason,
      });
    } else {
      accepted.push(source);
    }
  }

  return { accepted, rejected };
}

function isCurated(source) {
  return source.trust_tier === "curated" || (source.tags || []).includes("curated");
}

function getRejectionReason(source) {
  if (!source.title || !source.url) {
    return "Missing title or URL";
  }

  // Curated sources are manually vetted — bypass source_type filtering
  if (isCurated(source)) return null;

  if (REJECTED_SOURCE_TYPES.has(source.source_type)) {
    return `Rejected source_type: ${source.source_type}`;
  }

  if (!ACCEPTED_SOURCE_TYPES.has(source.source_type)) {
    return `Unsupported source_type: ${source.source_type}`;
  }

  return null;
}
