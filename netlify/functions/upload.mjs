import crypto from "node:crypto";
import { imgStore, json, isAdmin } from "../lib/common.mjs";

// Admin only: stores an ad image (jpeg/png/webp up to ~2.5 MB) and returns its URL.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isAdmin(req)) return json({ error: "Not logged in" }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad data" }, 400); }

  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body?.dataUrl || "");
  if (!m) return json({ error: "Only JPG, PNG or WebP images are allowed" }, 400);
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 2.5 * 1024 * 1024) return json({ error: "Image is too big (max 2.5 MB)" }, 413);

  const key = crypto.randomUUID();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  try {
    await imgStore().set(key, ab, { metadata: { contentType: m[1] } });
  } catch (e) {
    console.error("upload error", e);
    return json({ error: "Could not store the image" }, 500);
  }
  return json({ url: "/api/img/" + key });
};

export const config = { path: "/api/upload" };
