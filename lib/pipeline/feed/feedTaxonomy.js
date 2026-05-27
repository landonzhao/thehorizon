/**
 * Layer 5A — Feed Taxonomy
 * Assigns source-type-aware feed taxonomy fields to each source.
 * Deterministic rules only — no LLM.
 *
 * @deprecated Superseded by lib/pipeline/rawfact/rawfactTaxonomy.js (Layer 7.1A).
 * Retained for backward compatibility. Do not add new logic here.
 */

// ── Keyword helpers ────────────────────────────────────────────────────────────

function textOf(source) {
  return `${source.title || ""} ${source.full_text || ""}`.toLowerCase();
}

function inferSector(source) {
  const text = textOf(source);
  const sectors = [];
  if (text.includes("financ") || text.includes("bank") || text.includes("wire fraud") || text.includes("payment"))
    sectors.push("financial_services");
  if (text.includes("health") || text.includes("medical") || text.includes("hospital"))
    sectors.push("healthcare");
  if (text.includes("energy") || text.includes("power grid") || text.includes("utility"))
    sectors.push("energy");
  if (text.includes("government") || text.includes("election") || text.includes("federal") || text.includes("nist") || text.includes("cisa"))
    sectors.push("government");
  if (text.includes("defence") || text.includes("defense") || text.includes("military"))
    sectors.push("defense");
  if (text.includes("telecom") || text.includes("telecommunication"))
    sectors.push("telecommunications");
  return sectors.length > 0 ? sectors : ["cross_sector"];
}

function inferTechnology(source) {
  const text = textOf(source);
  const tech = [];
  if (text.includes("llm") || text.includes("large language model")) tech.push("llm");
  if (text.includes("agent") || text.includes("agentic") || text.includes("autogpt") || text.includes("langchain")) tech.push("ai_agent");
  if (text.includes(" rag ") || text.includes("retrieval-augmented") || text.includes("rag poison") || text.includes("vector database")) tech.push("rag");
  if (text.includes("deepfake") || text.includes("synthetic media") || text.includes("voice clone") || text.includes("synthetic video")) tech.push("synthetic_media");
  if (text.includes("malware") || text.includes("reverse shell") || text.includes("exploit")) tech.push("malware");
  if (text.includes("model weight") || text.includes("pickle") || text.includes("model supply chain") || text.includes("hugging face")) tech.push("model_supply_chain");
  if (text.includes("transformer") || text.includes("neural network") || text.includes("ml model")) tech.push("ml_model");
  if (text.includes("api") || text.includes("sdk")) tech.push("api");
  if (text.includes("cve") || text.includes("vulnerability") || text.includes("deserialization")) tech.push("vulnerability_management");
  return tech;
}

function inferGeography(source) {
  const text = textOf(source);
  const geo = [];
  if (text.includes("china") || text.includes("chinese") || text.includes("prc") || text.includes("apt41")) geo.push("china");
  if (text.includes("russia") || text.includes("russian") || text.includes("apt28") || text.includes("cozy bear")) geo.push("russia");
  if (text.includes("iran") || text.includes("iranian")) geo.push("iran");
  if (text.includes("north korea") || text.includes("dprk") || text.includes("lazarus")) geo.push("north_korea");
  if (text.includes("united states") || text.includes("u.s.") || text.includes("cisa") || text.includes("nist")) geo.push("united_states");
  if (text.includes("europe") || text.includes("eu ") || text.includes("european")) geo.push("europe");
  if (text.includes("global") || text.includes("worldwide") || text.includes("international")) geo.push("global");
  return geo.length > 0 ? geo : [];
}

function inferImpactType(source) {
  const text = textOf(source);
  const types = [];
  if (text.includes("wire fraud") || text.includes("financial loss") || text.includes("payment") || text.includes("$")) types.push("financial");
  if (text.includes("data breach") || text.includes("exfiltrat") || text.includes("confidential")) types.push("confidentiality");
  if (text.includes("disinformation") || text.includes("reputation") || text.includes("brand")) types.push("reputational");
  if (text.includes("compromise") || text.includes("exploit") || text.includes("attack") || text.includes("vulnerability")) types.push("security");
  if (text.includes("shutdown") || text.includes("unavailab") || text.includes("disruption") || text.includes("operati")) types.push("operational");
  return types.length > 0 ? types : ["security"];
}

function inferImpactScope(sourceType) {
  if (sourceType === "incident") return "organization";
  if (sourceType === "threat_intelligence") return "sector";
  if (sourceType === "governance_signal" || sourceType === "ecosystem_signal") return "ecosystem";
  return "organization";
}

function inferImpactSeverity(sourceType) {
  if (sourceType === "vulnerability" || sourceType === "incident") return "high";
  if (sourceType === "research_finding") return "medium";
  if (sourceType === "governance_signal") return "low";
  return "unknown";
}

function inferOperationalRelevance(sourceType) {
  if (sourceType === "threat_intelligence" || sourceType === "incident") return "very_high";
  if (sourceType === "vulnerability") return "high";
  if (sourceType === "research_finding") return "medium";
  if (sourceType === "governance_signal" || sourceType === "ecosystem_signal") return "low";
  return "medium";
}

function inferNovelty(source) {
  const text = textOf(source);
  if (text.includes("new ") || text.includes("novel") || text.includes("first ") || text.includes("emerging")) return "new_tactic";
  if (text.includes("scale") || text.includes("at scale") || text.includes("scaled")) return "known_tactic_new_scale";
  return "known_tactic";
}

function buildFeedTags(source) {
  const tags = new Set(source.tags || []);

  // From understanding framework_tags
  if (source.understanding?.framework_tags) {
    for (const ft of source.understanding.framework_tags) {
      if (ft.tag) tags.add(ft.tag);
    }
  }

  // Type-based tags
  const st = source.source_type || "";
  if (st === "vulnerability") {
    tags.add("vulnerability");
    if (textOf(source).includes("cve")) tags.add("cve");
  }
  if (st === "threat_intelligence") {
    tags.add("threat_intel");
    tags.add("ttp");
  }
  if (st === "research_finding") {
    tags.add("research");
    tags.add("academic");
  }
  if (st === "incident") {
    tags.add("incident");
  }

  return Array.from(tags);
}

function buildSourceTypeContext(sourceType) {
  switch (sourceType) {
    case "vulnerability":
      return {
        exploitability: "unknown",
        exploit_status: "unknown",
        blast_radius: "unknown",
        patch_status: "unknown",
        affected_ecosystem_importance: "unknown",
      };
    case "incident":
      return {
        confirmed_real_world_impact: true,
        repeatability: "unknown",
        attacker_workflow_visible: false,
      };
    case "research_finding":
      return {
        technical_novelty: "medium",
        reproducibility: "unknown",
        research_to_threat_potential: "medium",
      };
    case "threat_intelligence":
      return {
        active_threat_activity: true,
        campaign_scope: "unknown",
        operational_confidence: "medium",
      };
    default:
      return {};
  }
}

/**
 * Apply feed taxonomy to an array of sources.
 *
 * @param {object[]} sources
 * @returns {object[]} sources with `feed_taxonomy` field added
 */
export function applyFeedTaxonomies(sources) {
  return sources.map((source) => {
    const st = source.source_type || "unknown";

    const feed_taxonomy = {
      feed_tags: buildFeedTags(source),
      sector: inferSector(source),
      geography: inferGeography(source),
      technology: inferTechnology(source),
      affected_systems: source.understanding?.affected_systems || [],
      impact_type: inferImpactType(source),
      impact_scope: inferImpactScope(st),
      impact_severity: inferImpactSeverity(st),
      operational_relevance: inferOperationalRelevance(st),
      novelty: inferNovelty(source),
      source_type_context: buildSourceTypeContext(st),
    };

    return { ...source, feed_taxonomy };
  });
}
