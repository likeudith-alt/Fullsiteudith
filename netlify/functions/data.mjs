import { dataStore, json } from "../lib/common.mjs";

// Public: the website reads all its content from here.
export default async () => {
  try {
    const d = await dataStore().get("site", { type: "json" });
    return json(d || { empty: true });
  } catch (e) {
    console.error("data error", e);
    return json({ error: "Store unavailable" }, 500);
  }
};

export const config = { path: "/api/data" };
