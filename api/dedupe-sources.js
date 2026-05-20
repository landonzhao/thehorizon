import { supabase } from "../lib/storage/supabaseClient.js";

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

function canonicalUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    url.hash = "";

    for (const param of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ]) {
      url.searchParams.delete(param);
    }

    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return rawUrl.toLowerCase().trim();
  }
}

function titleKey(title = "") {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("sources")
      .select("id,title,url,date_published,publisher")
      .order("date_published", { ascending: false });

    if (error) throw error;

    const seen = new Map();
    const duplicateIds = [];

    for (const source of data || []) {
      const key = canonicalUrl(source.url) || titleKey(source.title);

      if (!key) continue;

      if (seen.has(key)) {
        duplicateIds.push(source.id);
      } else {
        seen.set(key, source.id);
      }
    }

    if (duplicateIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("sources")
        .delete()
        .in("id", duplicateIds);

      if (deleteError) throw deleteError;
    }

    return res.status(200).json({
      checked: data.length,
      deleted_duplicates: duplicateIds.length,
      duplicate_ids: duplicateIds,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
