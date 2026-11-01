import { dataStore, json, isAdmin } from "../lib/common.mjs";
import { sanitize } from "../lib/sanitize.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isAdmin(req)) return json({ error: "Not logged in" }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad data" }, 400); }

  const clean = sanitize(body);
  try {
    const store = dataStore();
    const old = await store.get("site", { type: "json" });
    if (old) await store.setJSON("site-backup", old); // one-step undo copy
    await store.setJSON("site", clean);
  } catch (e) {
    console.error("save error", e);
    return json({ error: "Could not save. Try again." }, 500);
  }
  return json({ ok: true, data: clean });
};

export const config = { path: "/api/save" };
