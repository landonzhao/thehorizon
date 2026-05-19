import { put } from "@vercel/blob";

export async function uploadArchiveJson(path, data) {
  const blob = await put(path, JSON.stringify(data, null, 2), {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    contentType: "application/json",
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}
