import { imgStore } from "../lib/common.mjs";

// Public: serves uploaded ad images.
export default async (req) => {
  const key = new URL(req.url).pathname.split("/").pop();
  if (!/^[0-9a-f-]{36}$/.test(key)) return new Response("Not found", { status: 404 });
  try {
    const r = await imgStore().getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, {
      headers: {
        "content-type": r.metadata?.contentType || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    console.error("img error", e);
    return new Response("Error", { status: 500 });
  }
};

export const config = { path: "/api/img/*" };
