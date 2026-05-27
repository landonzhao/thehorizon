/**
 * GET /api/generate-report
 *
 * Returns the latest generated deck from the `decks` table.
 * Pass ?deck_id=deck-2026-05-26 to fetch a specific deck.
 * Pass ?list=1 to get a list of recent deck runs (metadata only).
 *
 * Full deck JSON (synthesis + slides + QA) lives in Vercel Blob;
 * `blob_path` in the response is the URL to that payload.
 *
 * Deck generation is NOT triggered here — run the deck locally:
 *   node scripts/runHorizonScanMVP.js [options]
 *
 * Authorization: Bearer CRON_SECRET header (or x-vercel-cron: 1).
 */

import { loadLatestDeck, listDecks, getDeck } from "../lib/storage/deckStore.js";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (
    req.headers.authorization === `Bearer ${secret}` ||
    req.headers["x-vercel-cron"] === "1"
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { list, deck_id } = req.query;

    if (list === "1") {
      const decks = await listDecks(20);
      return res.status(200).json({ decks });
    }

    const deck = deck_id
      ? await getDeck(deck_id)
      : await loadLatestDeck();

    if (!deck) {
      return res.status(404).json({
        error: "No deck found",
        hint: "Run: node scripts/runHorizonScanMVP.js to generate one",
      });
    }

    return res.status(200).json(deck);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
