// Source types that are always accepted without conditions.
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

// Source types that are accepted conditionally. Each entry is a predicate that
// returns true (accept) or false (reject) given the source object.
// The second element is whether to mark the source as needs_review = true.
const CONDITIONAL_SOURCE_TYPES = {
  // Unknown type: accept everything but flag for human review
  unknown: { accept: () => true, needsReview: true },

  // Incident databases always contain actionable threat records
  incident_database: { accept: () => true, needsReview: false },

  // AI threat frameworks (MITRE ATLAS pages, OWASP entries) are reference material
  ai_threat_framework: { accept: () => true, needsReview: false },

  // Social signals: only accept from high-credibility publishers (e.g. an official
  // tweet from CISA or Anthropic), not from random social media accounts
  social_signal: {
    accept: (source) => ["primary", "high", "curated"].includes(source.trust_tier),
    needsReview: false,
  },

  // Open-source projects: accept only if the record contains a CVE reference or
  // clear security-advisory language — e.g. a GitHub advisory, not a random repo
  open_source_project: {
    accept: (source) => {
      const text = `${source.title || ""} ${source.full_text || ""}`.toLowerCase();
      return /cve-\d{4}-\d+|security advisory|vulnerability|exploit|patch|disclosure/.test(text);
    },
    needsReview: false,
  },
};

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

function isCurated(source) {
  return source.trust_tier === "curated" || (source.tags || []).includes("curated");
}

function getAcceptanceDecision(source) {
  // Hard gate: missing identity fields
  if (!source.title || !source.url) {
    return { reject: true, reason: "Missing title or URL" };
  }

  // Curated sources bypass all type filtering — they were manually vetted
  if (isCurated(source)) return { reject: false };

  // Standard accepted types
  if (ACCEPTED_SOURCE_TYPES.has(source.source_type)) return { reject: false };

  // Conditionally accepted types
  const conditional = CONDITIONAL_SOURCE_TYPES[source.source_type];
  if (conditional) {
    if (conditional.accept(source)) {
      return { reject: false, needsReview: conditional.needsReview };
    }
    return {
      reject: true,
      reason: `${source.source_type}: does not meet acceptance criteria (trust_tier=${source.trust_tier})`,
    };
  }

  // Completely unknown type — hard reject
  return { reject: true, reason: `Unsupported source_type: ${source.source_type}` };
}
