import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Netlify Blobs storage
export const dataStore = () =>
  getStore({ name: "udith-store", consistency: "strong" });

export const imgStore = () =>
  getStore({ name: "udith-images", consistency: "strong" });

// JSON response
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

// Authentication secret
const secret = () => process.env.SESSION_SECRET || "";

const sign = (payload) =>
  crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");

// Create ADMIN-only token
export function makeToken(hours = 12) {
  if (!secret()) {
    throw new Error("SESSION_SECRET is not configured.");
  }

  const payload = Buffer.from(
    JSON.stringify({
      type: "admin",
      exp: Date.now() + hours * 3600e3
    })
  ).toString("base64url");

  return payload + "." + sign(payload);
}

// Verify ADMIN-only token
export function verifyToken(token) {
  if (!secret() || !token) return false;

  const [payload, signature] = String(token).split(".");

  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);

  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) {
    return false;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    return (
      data.type === "admin" &&
      typeof data.exp === "number" &&
      data.exp > Date.now()
    );
  } catch {
    return false;
  }
}

// Admin API authorization
export const isAdmin = (req) =>
  verifyToken(
    (req.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
  );

// Check admin password
export function checkPassword(password) {
  const real = process.env.ADMIN_PASSWORD || "";

  if (!real) return false;

  const hash = (value) =>
    crypto.createHash("sha256").update(String(value)).digest();

  return crypto.timingSafeEqual(
    hash(password),
    hash(real)
  );
}
