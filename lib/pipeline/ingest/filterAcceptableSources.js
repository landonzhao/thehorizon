import { ALL_SOURCE_TYPES } from "../../config/sourceTypes.js";

// All vocabulary-defined types are always accepted. "unknown" gets conditional
// treatment (flagged for human review rather than rejected outright).
const ACCEPTED_SOURCE_TYPES = new Set(ALL_SOURCE_TYPES.filter((t) => t !== "unknown"));

function isCurated(source) {
  return source.trust_tier === "curated" || (source.tags || []).includes("curated");
}

function getAcceptanceDecision(source) {
  if (!source.title || !source.url) {
    return { reject: true, reason: "Missing title or URL" };
  }

  // Curated sources bypass all type filtering — they were manually vetted
  if (isCurated(source)) return { reject: false };

  // All controlled-vocabulary types are accepted unconditionally
  if (ACCEPTED_SOURCE_TYPES.has(source.source_type)) return { reject: false };

  // Unknown type: accept but flag for human review
  if (source.source_type === "unknown") {
    return { reject: false, needsReview: true };
  }

  return { reject: true, reason: `Unsupported source_type: ${source.source_type}` };
}

export function filterAcceptableSources(sources) {
  const accepted = [];
  const rejected = [];

  for (const source of sources) {
    const decision = getAcceptanceDecision(source);

    if (decision.reject) {
      rejected.push({
        id: source.id,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        source_type: source.source_type,
        reason: decision.reason,
      });
    } else {
      accepted.push(
        decision.needsReview ? { ...source, needs_review: true } : source
      );
    }
  }

  return { accepted, rejected };
}
