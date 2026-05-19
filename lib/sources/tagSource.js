export function inferSourceTags(source) {
  const text = `${source.title} ${source.full_text} ${source.publisher}`.toLowerCase();
  const tags = [];

  if (text.includes("prompt injection")) tags.push("prompt_injection");
  if (text.includes("jailbreak")) tags.push("jailbreak");
  if (text.includes("agent")) tags.push("agentic_ai");
  if (text.includes("deepfake")) tags.push("deepfake");
  if (text.includes("phishing")) tags.push("phishing");
  if (text.includes("malware")) tags.push("malware");
  if (text.includes("vulnerability") || text.includes("cve")) tags.push("vulnerability");
  if (text.includes("policy") || text.includes("regulation")) tags.push("policy");
  if (text.includes("benchmark") || text.includes("paper")) tags.push("research");
  if (text.includes("detection") || text.includes("soc")) tags.push("ai_for_security");

  return [...new Set(tags)];
}

export function attachInitialTags(sources) {
  return sources.map((source) => ({
    ...source,
    tags: inferSourceTags(source),
  }));
}
