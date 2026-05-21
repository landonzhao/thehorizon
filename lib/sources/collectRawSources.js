import { fetchNvdSources } from "./connectors/nvdConnector.js";
import { fetchArxivSources } from "./connectors/arxivConnector.js";
import { fetchAiIncidentSources } from "./connectors/aiIncidentConnector.js";
import { fetchLlmDiscoverySources } from "./connectors/llmDiscoveryConnector.js";
import { fetchRegistryFeedSources } from "./connectors/registryFeedConnector.js";

import { SOURCE_REGISTRY } from "./sourceRegistry.js";
import { runConnector } from "./runConnector.js";
import { filterAcceptableSources } from "./filterAcceptableSources.js";

import { getSingaporeDailyWindow, isWithinWindow } from "../time/reportingWindow.js";
import { cleanSources } from "../cleaning/cleanSources.js";
import { dedupeSources } from "../utils/dedupe.js";
import { attachValidityToSources } from "../validation/sourceValidity.js";
import { attachInitialTags } from "./tagSource.js";
import { archiveSources } from "../archive/archiveStore.js";


function filterByPublishedDateWindow(sources, window) {
  const kept = [];
  const removed = [];

  for (const source of sources) {
    if (source.date_published && isWithinWindow(source.date_published, window)) {
      kept.push(source);
    } else {
      removed.push({
        id: source.id,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        source_type: source.source_type,
        date_published: source.date_published,
        date_collected: source.date_collected,
        reason: source.date_published
          ? "Published date outside reporting window"
          : "Missing valid published date",
      });
    }
  }

  return { kept, removed };
}

export async function collectRawSources(customWindow = null, options = {}) {
  const window = customWindow || getSingaporeDailyWindow();

  const includeFeeds = options.includeFeeds ?? true;
  const requestedConnectors = options.connectors || null;

  const registryConnectors = SOURCE_REGISTRY
    .filter((source) => source.enabled)
    .map((source) => ({
      name: source.name,
      key: source.name.toLowerCase().replaceAll(" ", "_"),
      trust_tier: source.trust_tier,
      retrieval_method: source.retrieval_method,
      timeout_ms: 6000,
      run: (runOptions) => fetchRegistryFeedSources(source, runOptions),
    }));

  const apiConnectors = [
    {
      name: "NVD",
      key: "nvd",
      trust_tier: "primary",
      retrieval_method: "official_api",
      timeout_ms: 12000,
      run: fetchNvdSources,
    },
    {
      name: "arXiv",
      key: "arxiv",
      trust_tier: "medium",
      retrieval_method: "official_api",
      timeout_ms: 120000,  // 7 queries × ~5s each + rate-limit retries
      run: fetchArxivSources,
    },
    {
      name: "AI Incident Database",
      key: "aiid",
      trust_tier: "high",
      retrieval_method: "official_api",
      timeout_ms: 15000,
      run: fetchAiIncidentSources,
    },
    {
      name: "LLM Discovery",
      key: "llm_discovery",
      trust_tier: "medium",
      retrieval_method: "llm_discovery",
      timeout_ms: 60000,  // 4 parallel Gemini calls with grounding
      run: fetchLlmDiscoverySources,
    },
  ];

  const filteredApiConnectors = requestedConnectors
    ? apiConnectors.filter((connector) =>
        requestedConnectors.includes(connector.key)
      )
    : apiConnectors;

  const connectors = [
    ...(includeFeeds ? registryConnectors : []),
    ...filteredApiConnectors,
  ];

  const connectorRuns = await Promise.all(
    connectors.map((connector) => runConnector(connector, { window }))
  );

  const rawSources = connectorRuns.flatMap((run) => run.sources);
  const cleaned = cleanSources(rawSources);

  const { kept: windowed, removed: removedByPublishDate } =
    filterByPublishedDateWindow(cleaned, window);

  const deduped = dedupeSources(windowed);
  const { accepted, rejected } = filterAcceptableSources(deduped);
  const withValidity = attachValidityToSources(accepted);

  const usableSources = withValidity.filter(
    (source) => source.validity?.usable
  );

  const discardedByValidity = withValidity
    .filter((source) => !source.validity?.usable)
    .map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      source_type: source.source_type,
      date_published: source.date_published,
      reason: "Failed validity check",
      validity: source.validity,
    }));

  const tagged = attachInitialTags(usableSources);

  let archive = null;
  try {
    archive = await archiveSources(tagged, window);
  } catch (err) {
    console.warn("Local archive skipped:", err.message);
  }

  return {
    reporting_window: window,
    sources: tagged,

    removed_by_publish_date: removedByPublishDate,
    removed_by_publish_date_count: removedByPublishDate.length,

    rejected_sources: rejected,
    rejected_count: rejected.length,

    discarded_by_validity: discardedByValidity,
    discarded_count: discardedByValidity.length,

    pipeline_counts: {
      connectors_run: connectors.length,
      raw: rawSources.length,
      cleaned: cleaned.length,
      within_publish_date_window: windowed.length,
      removed_by_publish_date: removedByPublishDate.length,
      deduped: deduped.length,
      accepted: accepted.length,
      rejected: rejected.length,
      validity_checked: withValidity.length,
      usable: usableSources.length,
      discarded_by_validity: discardedByValidity.length,
    },

    archive,

    connector_results: connectorRuns.map((run) => ({
      connector: run.name,
      status: run.status,
      count: run.count,
      error: run.error,
      trust_tier: run.trust_tier,
      retrieval_method: run.retrieval_method,
      started_at: run.started_at,
      finished_at: run.finished_at,
    })),
  };
}
