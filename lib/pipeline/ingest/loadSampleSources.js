/**
 * Layer 1 — Load sample sources from local JSON seed file.
 * Used by the MVP runner when Supabase is not needed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function loadSampleSources(filePath = null) {
  const resolved = filePath
    ? path.resolve(filePath)
    : path.join(ROOT, "data", "sample_sources.json");

  if (!fs.existsSync(resolved)) {
    throw new Error(`Sample sources file not found: ${resolved}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));

  if (!Array.isArray(raw)) throw new Error("sample_sources.json must be an array");

  return raw;
}
