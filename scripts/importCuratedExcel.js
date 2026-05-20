import "dotenv/config";
import fs from "fs";
import crypto from "crypto";
import XLSX from "xlsx";
import { supabase } from "../lib/storage/supabaseClient.js";
import { uploadArchiveJson } from "../lib/storage/blobArchiveStore.js";
import { cleanPlaintext } from "../lib/cleaning/cleanPlaintext.js";

const FILE_PATH = process.argv[2];

if (!FILE_PATH) {
  throw new Error("Usage: node scripts/importCuratedExcel.js <path-to-xlsx>");
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function publisherFromUrl(rawUrl = "") {
  try {
    const host = new URL(rawUrl).hostname.replace("www.", "");

    if (host.includes("thehackernews")) return "The Hacker News";
    if (host.includes("darkreading")) return "Dark Reading";
    if (host.includes("cloud.google")) return "Google Cloud Threat Intelligence";
    if (host.includes("microsoft")) return "Microsoft";
    if (host.includes("cisa")) return "CISA";
    if (host.includes("nist")) return "NIST";
    if (host.includes("owasp")) return "OWASP";
    if (host.includes("arxiv")) return "arXiv";

    return host;
  } catch {
    return "Unknown";
  }
}

function parseDate(value) {
  if (!value) return null;

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000).toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sourceTypeFromPublisher(publisher) {
  if (publisher.includes("Google Cloud")) return "threat_intel";
  if (publisher.includes("Microsoft")) return "threat_intel";
  if (publisher.includes("CISA")) return "government_advisory";
  if (publisher.includes("NIST")) return "policy_update";
  if (publisher.includes("OWASP")) return "security_framework";
  if (publisher.includes("arXiv")) return "research_paper";

  return "security_blog";
}

function tagsFromSheet(sheetName) {
  if (sheetName === "Security of AI") return ["security_of_ai", "curated"];
  if (sheetName === "AI for Cyber") return ["ai_for_security", "curated"];
  if (sheetName === "AI-Enabled Threats") return ["ai_enabled_threats", "curated"];
  return ["curated"];
}

// Curated sources are hand-picked — assign baseline scores so the classifier
// never deletes them and the scoring pipeline ranks them appropriately.
function baselineFromSheet(sheetName) {
  if (sheetName === "Security of AI") {
    return { ai_specificity_score: 80, relevance_tier: "core", main_category: "traditional_ai_threats" };
  }
  if (sheetName === "AI for Cyber") {
    return { ai_specificity_score: 65, relevance_tier: "core", main_category: "ai_for_security" };
  }
  if (sheetName === "AI-Enabled Threats") {
    return { ai_specificity_score: 75, relevance_tier: "core", main_category: "ai_enabled_threats" };
  }
  return { ai_specificity_score: 70, relevance_tier: "core", main_category: "uncategorised" };
}

function getSgtWindowForDate(dateIso) {
  const date = new Date(dateIso);
  const sgtMs = date.getTime() + 8 * 60 * 60 * 1000;
  const sgt = new Date(sgtMs);

  const y = sgt.getUTCFullYear();
  const m = sgt.getUTCMonth();
  const d = sgt.getUTCDate();
  const hour = sgt.getUTCHours();

  let endSgt = new Date(Date.UTC(y, m, d, 6, 0, 0));

  if (hour >= 6) {
    endSgt = new Date(endSgt.getTime() + 24 * 60 * 60 * 1000);
  }

  const startSgt = new Date(endSgt.getTime() - 24 * 60 * 60 * 1000);

  return {
    timezone: "Asia/Singapore",
    start_sgt: startSgt.toISOString(),
    end_sgt: endSgt.toISOString(),
    start_utc: new Date(startSgt.getTime() - 8 * 60 * 60 * 1000).toISOString(),
    end_utc: new Date(endSgt.getTime() - 8 * 60 * 60 * 1000).toISOString(),
  };
}

function snapshotIdFromWindow(window) {
  return `snapshot-${window.end_sgt.slice(0, 10)}`;
}

if (!fs.existsSync(FILE_PATH)) {
  throw new Error(`File not found: ${FILE_PATH}`);
}

const workbook = XLSX.readFile(FILE_PATH);
const acceptedSheets = ["Security of AI", "AI for Cyber", "AI-Enabled Threats"];

const rows = [];

for (const sheetName of acceptedSheets) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) continue;

  const data = XLSX.utils.sheet_to_json(sheet);

  const baseline = baselineFromSheet(sheetName);

  for (const row of data) {
    const title = cleanPlaintext(row.Title);
    const url = cleanPlaintext(row.URL);
    const summary = cleanPlaintext(row.Summary);
    const content = cleanPlaintext(row.Content);
    const date_published = parseDate(row.Published);

    if (!title || !url || !date_published) continue;

    const publisher = publisherFromUrl(url);
    const usableText = content || summary || "";
    const content_hash = sha256(`${title}|${url}|${usableText}`);

    rows.push({
      id: `curated-${content_hash.slice(0, 24)}`,
      title,
      url,
      publisher,
      date_published,
      source_type: sourceTypeFromPublisher(publisher),
      sheet_category: sheetName,
      full_text: usableText,
      summary,
      source_text_quality: content ? "partial_text" : "summary_only",
      needs_full_text_fetch: true,
      tags: tagsFromSheet(sheetName),
      content_hash,
      clean_text_hash: sha256(usableText),
      ...baseline,
    });
  }
}

console.log(`Parsed ${rows.length} curated rows`);

const dedupedRows = [...new Map(rows.map((row) => [row.id, row])).values()];

console.log(`After dedupe: ${dedupedRows.length} curated rows`);

if (dedupedRows.length === 0) {
  process.exit(0);
}

const { error: curatedError } = await supabase
  .from("curated_sources")
  .upsert(
    dedupedRows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      publisher: row.publisher,
      date_published: row.date_published,
      source_type: row.source_type,
      sheet_category: row.sheet_category,
      content: row.full_text,
      summary: row.summary,
      tags: row.tags,
      content_hash: row.content_hash,
    })),
    { onConflict: "id" }
  );

if (curatedError) throw curatedError;

const grouped = new Map();

for (const row of dedupedRows) {
  const window = getSgtWindowForDate(row.date_published);
  const snapshotId = snapshotIdFromWindow(window);

  if (!grouped.has(snapshotId)) {
    grouped.set(snapshotId, {
      snapshot_id: snapshotId,
      window,
      sources: [],
    });
  }

  grouped.get(snapshotId).sources.push(row);
}

for (const group of grouped.values()) {
  const snapshot = {
    snapshot_id: group.snapshot_id,
    generated_at: new Date().toISOString(),
    period: "daily",
    stage: "curated_excel_import_summary_only",
    reporting_window: group.window,
    count: group.sources.length,
    discarded_count: 0,
    rejected_count: 0,
    sources: group.sources.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      publisher: row.publisher,
      author: "",
      date_published: row.date_published,
      date_collected: new Date().toISOString(),
      source_type: row.source_type,
      raw_html: "",
      full_text: row.full_text,
      summary: row.summary,
      source_text_quality: row.source_text_quality,
      needs_full_text_fetch: row.needs_full_text_fetch,
      relevance_tier: row.relevance_tier,
      ai_specificity_score: row.ai_specificity_score,
      main_category: row.main_category,
      attachments: [],
      trust_tier: "curated",
      validity: {
        source_id: row.id,
        source_validity_score: 90,
        credibility_label: "curated",
        trust_tier: "curated",
        warnings: ["Imported from curated Excel; full article text not fetched yet."],
        usable: true,
      },
      tags: row.tags,
      content_hash: row.content_hash,
      clean_text_hash: row.clean_text_hash,
    })),
  };

  const blob = await uploadArchiveJson(
    `curated-snapshots/${group.snapshot_id}.json`,
    snapshot
  );

  const { error: snapshotError } = await supabase.from("snapshots").upsert(
    {
      snapshot_id: group.snapshot_id,
      period: "daily",
      generated_at: snapshot.generated_at,
      start_utc: group.window.start_utc,
      end_utc: group.window.end_utc,
      start_local: group.window.start_sgt,
      end_local: group.window.end_sgt,
      count: snapshot.count,
      discarded_count: 0,
      rejected_count: 0,
      blob_path: blob.url,
    },
    { onConflict: "snapshot_id" }
  );

  if (snapshotError) throw snapshotError;

  const sourceRows = snapshot.sources.map((source) => ({
    id: source.id,
    snapshot_id: group.snapshot_id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    author: source.author,
    date_published: source.date_published,
    source_type: source.source_type,
    trust_tier: source.trust_tier,
    credibility_label: source.validity.credibility_label,
    validity_score: source.validity.source_validity_score,
    tags: source.tags,
    full_text: source.full_text,
    summary: source.summary,
    source_text_quality: source.source_text_quality,
    needs_full_text_fetch: source.needs_full_text_fetch,
    content_hash: source.content_hash,
    clean_text_hash: source.clean_text_hash,
    blob_path: blob.url,
    // Baseline AI relevance fields so curated sources are never purged
    relevance_tier: source.relevance_tier,
    ai_specificity_score: source.ai_specificity_score,
    main_category: source.main_category,
  }));

  const { error: sourceError } = await supabase
    .from("sources")
    .upsert(sourceRows, { onConflict: "id" });

  if (sourceError) throw sourceError;

  console.log(`Imported ${group.snapshot_id}: ${snapshot.count} sources`);
}

console.log("Curated Excel import complete.");
