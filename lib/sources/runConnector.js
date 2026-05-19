export async function runConnector(connector, context = {}) {
  const startedAt = new Date().toISOString();
  const timeoutMs = connector.timeout_ms || 12000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sources = await connector.run({
      signal: controller.signal,
      window: context.window,
    });

    clearTimeout(timeout);

    return {
      name: connector.name,
      status: "fulfilled",
      count: sources.length,
      sources,
      error: null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      trust_tier: connector.trust_tier,
      retrieval_method: connector.retrieval_method,
    };
  } catch (error) {
    clearTimeout(timeout);

    return {
      name: connector.name,
      status: "rejected",
      count: 0,
      sources: [],
      error: error.message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      trust_tier: connector.trust_tier,
      retrieval_method: connector.retrieval_method,
    };
  }
}
