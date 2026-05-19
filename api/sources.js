import { getSnapshot } from "../lib/storage/snapshotStore.js";

export default async function handler(req, res) {
  const snapshot = await getSnapshot();
  return res.status(200).json(snapshot);
}
