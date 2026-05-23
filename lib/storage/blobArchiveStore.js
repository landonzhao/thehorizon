import { put } from "@vercel/blob";

/**
 * Upload JSON to Vercel Blob.
 *
 * @param {string}  path         Blob path (key)
 * @param {*}       data         Any JSON-serialisable value
 * @param {object}  [opts]
 * @param {boolean} [opts.overwrite=true]  Allow overwriting an existing blob at this path.
 *                               Set to false for immutable run archives.
 */
export async function uploadArchiveJson(path, data, { overwrite = true } = {}) {
  const blob = await put(path, JSON.stringify(data, null, 2), {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: "application/json",
  });

  return {
    url:      blob.url,
    pathname: blob.pathname,
  };
}
