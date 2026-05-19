import "dotenv/config";
import fs from "fs";
import crypto from "crypto";
import XLSX from "xlsx";
import { supabase } from "../lib/storage/supabaseClient.js";
import { uploadArchiveJson } from "../lib/storage/blobArchiveStore.js";

const FILE_PATH = process.argv[2];

if (!FILE_PATH) {
  throw new Error("Usage: node scripts/importCuratedExcel.js <path-to-xlsx>");
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(value).digest("hex");
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

    return host;
  } catch {
    return "Unknown";
  }
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value) {
  if (!value) return null;

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return date.toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function sourceTypeFromPublisher(publisher) {
  if (publisher.includes("Google Cloud")) return "threat_intel";
  if (publisher.includes("Microsoft")) return "threat_intel";
  if (publisher.includes("CISA")) return "government_advisory";
  if (publisher.includes("NIST")) return "policy_update";

  return "security_blog";
}

function tagsFromSheet(sheetName) {
  if (sheetName === "Security of AI") return ["security_of_ai"];
  if (sheetName === "AI for Cyber") return ["ai_for_security"];
  if (sheetName === "AI-Enabled Threats") return ["ai_enabled_threats"];

  return ["curated"];
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
    start_local: startSgt.toISOString(),
    end_local: endSgt.toISOString(),
    start_utc: new Date(startSgt.getTime() - 8 * 60 * 60 * 1000).toISOString(),
    end_utc: new Date(endSgt.getTime() - 8 * 60 * 60 * 1000).toISOString(),
  };
}

function snapshotIdFromWindow(window) {
  return `snapshot-${window.end_local.slice(0, 10)}`;
}

const workbook = XLSX.readFile(FILE_PATH);
const acceptedSheets = ["Security of AI", "AI for Cyber", "AI-Enabled Threats"];

const rows = [];

for (const sheetName of acceptedSheets) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) continue;

  const data = XLSX.utils.sheet_to_json(sheet);

  for (const row of data) {
    const title = cleanText(row.Title);
    const url = cleanText(row.URL);
    const content = cleanText(row.Content);
    const summary = cleanText(row.Summary);
    const date_published = parseDate(row.Published);

    if (!title || !url || !date_published) continue;

    const publisher = publisherFromUrl(url);
    const content_hash = sha256(`${title}|${url}|${content}`);

    rows.push({
      id: `curated-${content_hash.slice(0, 24)}`,
      title,
      url,
      publisher,
      date_published,
      source_type: sourceTypeFromPublisher(publisher),
      sheet_category: sheetName,
      content,
      summary,
      tags: tagsFromSheet(sheetName),
      content_hash,
    });
  }
}

console.log(`Parsed ${rows.length} curated rows`);

if (rows.length === 0) {
  process.exit(0);
}

await supabase.from("curated_sources").upsert(rows, { onConflict: "id" });

const grouped = new Map();

for (const row of rows) {
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
    stage: "curated_excel_import",
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
      full_text: row.content,
      attachments: [],
      trust_tier: "curated",
      validity: {
        source_id: row.id,
        source_validity_score: 90,
        credibility_label: "curated",
        trust_tier: "curated",
        warnings: [],
        usable: true,
      },
      tags: row.tags,
    })),
  };

  const blob = await uploadArchiveJson(
    `curated-snapshots/${group.snapshot_id}.json`,
    snapshot
  );

  await supabase.from("snapshots").upsert(
    {
      snapshot_id: group.snapshot_id,
      period: "daily",
      generated_at: snapshot.generated_at,
      start_utc: group.window.start_utc,
      end_utc: group.window.end_utc,
      start_local: group.window.start_local,
      end_local: group.window.end_local,
      count: snapshot.count,
      discarded_count: 0,
      rejected_count: 0,
      blob_path: blob.url,
    },
    { onConflict: "snapshot_id" }
  );

  const sourceRows = snapshot.sources.map((source) => ({
    id: source.id,
    snapshot_id: group.snapshot_id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    author: "",
    date_published: source.date_published,
    source_type: source.source_type,
    trust_tier: "curated",
    credibility_label: "curated",
    validity_score: 90,
    tags: source.tags,
    content_hash: sha256(source.full_text),
    blob_path: blob.url,
  }));

  await supabase.from("sources").upsert(sourceRows, { onConflict: "id" });

  console.log(`Imported ${group.snapshot_id}: ${snapshot.count} sources`);
}

console.log("Curated Excel import complete.");
