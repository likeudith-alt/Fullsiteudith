import crypto from "node:crypto";
import { dataStore, json } from "../lib/common.mjs";
const store = () => dataStore();
const cleanPhone = (v) => String(v || "").replace(/[^\d+]/g, "").replace(/^00/, "+").slice(0, 18);
const hash = (p, salt) => crypto.scryptSync(String(p), salt, 64).toString("hex");
async function read() { return (await store().get("customer-accounts", { type: "json" }).catch(() => null)) || []; }
export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Invalid data" }, 400); }
  const phone = cleanPhone(body.phone), password = String(body.password || "");
  if (!/^\+?\d{9,15}$/.test(phone)) return json({ error: "Enter a valid WhatsApp number with country code." }, 400);
  if (password.length < 8 || password.length > 128) return json({ error: "Password must be 8–128 characters." }, 400);
  try {
    const users = await read();
    let user = users.find(x => x.phone === phone);
    if (body.action === "register") {
      if (user) return json({ error: "This WhatsApp number is already registered. Please log in." }, 409);
      const salt = crypto.randomBytes(16).toString("hex");
      user = { id: crypto.randomUUID(), phone, salt, passwordHash: hash(password, salt), createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() };
      users.push(user);
    } else if (body.action === "login") {
      if (!user || hash(password, user.salt) !== user.passwordHash) return json({ error: "Incorrect WhatsApp number or password." }, 401);
      user.lastLoginAt = new Date().toISOString();
    } else return json({ error: "Unknown action" }, 400);
    await store().setJSON("customer-accounts", users);
    return json({ ok: true, customer: { phone: user.phone, createdAt: user.createdAt } });
  } catch (e) { console.error("customer auth error", e); return json({ error: "Could not save account. Please try again." }, 500); }
};
export const config = { path: "/api/customer-auth" };
