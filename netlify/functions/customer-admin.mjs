import { dataStore, json, isAdmin } from "../lib/common.mjs";
export default async (req) => {
  if (!isAdmin(req)) return json({ error: "Admin login required" }, 401);
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  try {
    const users = (await dataStore().get("customer-accounts", { type: "json" }).catch(() => [])) || [];
    return json({ customers: users.map(({ phone, createdAt, lastLoginAt }) => ({ phone, createdAt, lastLoginAt })).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  } catch (e) { console.error(e); return json({ error: "Could not load customers" }, 500); }
};
export const config = { path: "/api/customer-admin" };
