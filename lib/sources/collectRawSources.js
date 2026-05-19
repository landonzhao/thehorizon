import { fetchNvdSources } from "./connectors/nvdConnector.js";
import { fetchArxivSources } from "./connectors/arxivConnector.js";
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

function filterByWindow(sources, window) {
  return sources.filter((source) => {
    if (!source.date_published) return true;

    const date = new Date(source.date_published);
    if (Number.isNaN(date.getTime())) return true;

    const insideWindow = isWithinWindow(source.date_published, window);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const isTrustedFeed = ["primary", "high"].includes(
      source.trust_tier || source.collection_metadata?.trust_tier
    );

    if (isTrustedFeed && date >= sevenDaysAgo) {
      return true;
    }

    return insideWindow;
  });
}

export async function collectRawSources() {
  const window = getSingaporeDailyWindow();

  const registryConnectors = SOURCE_REGISTRY
    .filter((source) => source.enabled)
    .map((source) => ({
      name: source.name,
      trust_tier: source.trust_tier,
      retrieval_method: source.retrieval_method,
      timeout_ms: 12000,
      run: (options) => fetchRegistryFeedSources(source, options),
    }));

  const apiConnectors = [
    {
      name: "NVD",
      trust_tier: "primary",
      retrieval_method: "official_api",
      timeout_ms: 12000,
      run: fetchNvdSources,
    },
    {
      name: "arXiv",
      trust_tier: "medium",
      retrieval_method: "official_api",
      timeout_ms: 12000,
      run: fetchArxivSources,
    },
  ];

  const connectors = [...registryConnectors, ...apiConnectors];

  const connectorRuns = await Promise.all(
    connectors.map((connector) => runConnector(connector))
  );

  const rawSources = connectorRuns.flatMap((run) => run.sources);
  const cleaned = cleanSources(rawSources);
  const windowed = filterByWindow(cleaned, window);
  const deduped = dedupeSources(windowed);

  const { accepted, rejected } = filterAcceptableSources(deduped);

  const withValidity = attachValidityToSources(accepted);

  const usableSources = withValidity.filter(
    (source) => source.validity?.usable
  );

  const tagged = attachInitialTags(usableSources);
  const archive = await archiveSources(tagged, window);

  return {
    reporting_window: window,
    sources: tagged,

    rejected_sources: rejected,
    rejected_count: rejected.length,

    discarded_count: withValidity.length - usableSources.length,

    pipeline_counts: {
      raw: rawSources.length,
      cleaned: cleaned.length,
      windowed: windowed.length,
      deduped: deduped.length,
      accepted: accepted.length,
      rejected: rejected.length,
      validity_checked: withValidity.length,
      usable: usableSources.length,
      discarded: withValidity.length - usableSources.length,
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
