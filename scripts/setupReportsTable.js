/**
 * One-time setup: create the `reports` table in Supabase.
 * Run once: node scripts/setupReportsTable.js
 */
import "dotenv/config";
import { supabase } from "../lib/storage/supabaseClient.js";

const SQL = `
CREATE TABLE IF NOT EXISTS reports (
  report_id      TEXT PRIMARY KEY,
  period         TEXT NOT NULL,
  week_key       TEXT NOT NULL,
  date_from      DATE NOT NULL,
  date_to        DATE NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_count   INTEGER NOT NULL DEFAULT 0,
  is_complete    BOOLEAN NOT NULL DEFAULT FALSE,
  report_json    JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_period_date_idx ON reports (period, date_to DESC);
CREATE INDEX IF NOT EXISTS reports_week_key_idx    ON reports (week_key);
`;

let error;
try {
  const result = await supabase.rpc("exec_sql", { sql: SQL });
  error = result.error;
} catch (e) {
  error = { message: e.message };
}

if (error) {
  console.log("RPC not available — paste this SQL into Supabase SQL Editor:");
  console.log(SQL);
} else {
  console.log("reports table created successfully.");
}
