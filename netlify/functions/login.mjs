import { json, makeToken, checkPassword } from "../lib/common.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD is not set in Netlify (Site configuration → Environment variables)." }, 500);
  }
  let body = {};
  try { body = await req.json(); } catch {}
  if (!checkPassword(body.password || "")) {
    await new Promise((r) => setTimeout(r, 900)); // slows down password guessing
    return json({ error: "Wrong password" }, 401);
  }
  return json({ token: makeToken(12) });
};

export const config = { path: "/api/login" };
