import crypto from "node:crypto";
import { dataStore, json } from "../lib/common.mjs";
const store = () => dataStore();
async function read(key, fallback) {
  return (await store().get(key, { type: "json" }).catch(() => null)) || fallback;
}
export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid data" }, 400); }
  const uid = String(body.gameUid || "").replace(/\\D/g, "").slice(0, 20);
  if (uid.length < 5) return json({ error: "Enter a valid Free Fire UID (5–20 digits)." }, 400);
  try {
    const all = await read("free-likes-requests", []);
    const recent = all.filter((item) => {
      const age = Date.now() - Date.parse(item.createdAt);
      return item.gameUid === uid && Number.isFinite(age) && age >= 0 && age < 60 * 60e3;
    });
    if (recent.length >= 3) return json({ error: "This UID has already sent 3 requests in the last hour." }, 429);
    const now = new Date().toISOString();
    const request = {
      id: "FL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      gameUid: uid, status: "Pending",
      notification: "Your Free Likes request was received.",
      createdAt: now, updatedAt: now
    };
    all.unshift(request);
    await store().setJSON("free-likes-requests", all.slice(0, 5000));
    return json({ ok: true, request: { id: request.id, gameUid: uid, status: request.status, createdAt: now } });
  } catch (error) {
    console.error("free likes error", error);
    return json({ error: "Could not process the request. Please try again." }, 500);
  }
};
export const config = { path: "/api/free-likes" };
