// Cleans whatever the admin panel sends, so the public site always gets safe, well-formed data.
const s = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const n = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.round(x) : null;
};
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const slug = (v, fallback) =>
  s(v, 60).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
const url = (v) => {
  const t = s(v, 500);
  return /^(https?:\/\/|\/(?!\/))/i.test(t) ? t : "";
};

function uniq(list, key, reserved = []) {
  const seen = new Set(reserved);
  for (const o of list) {
    let k = o[key];
    let c = 2;
    while (seen.has(k)) k = o[key] + "-" + c++;
    o[key] = k;
    seen.add(k);
  }
  return list;
}

export function sanitize(d) {
  d = d && typeof d === "object" ? d : {};
  const st = d.settings && typeof d.settings === "object" ? d.settings : {};

  const settings = {
    storeName: s(st.storeName, 60) || "UDITH STORE",
    whatsapp: s(st.whatsapp, 20).replace(/\D/g, ""),
    whatsappDisplay: s(st.whatsappDisplay, 30),
    heroText: s(st.heroText, 300),
    bannerText: s(st.bannerText, 300),
    footerText: s(st.footerText, 200),
    tickerLines: arr(st.tickerLines, 30).map((x) => s(x, 140)).filter(Boolean),
  };

  const payments = uniq(
    arr(d.payments, 12)
      .map((p, i) => ({
        id: slug(p?.id || p?.name, "pay" + i),
        icon: s(p?.icon, 8) || "💳",
        name: s(p?.name, 60),
        fee: n(p?.fee) || 0,
        rows: arr(p?.rows, 12)
          .map((r) => ({ label: s(r?.label, 60), value: s(r?.value, 120) }))
          .filter((r) => r.label || r.value),
      }))
      .filter((p) => p.name),
    "id"
  );

  const categories = uniq(
    arr(d.categories, 40)
      .map((c, i) => ({
        id: slug(c?.id || c?.title, "cat" + i),
        icon: s(c?.icon, 8) || "🛒",
        title: s(c?.title, 80) || "Category",
        desc: s(c?.desc, 200),
        ask: s(c?.ask, 200),
        note: s(c?.note, 400),
        hot: !!c?.hot,
        visible: c?.visible !== false,
        items: uniq(
          arr(c?.items, 60)
            .map((it, j) => ({
              id: slug(it?.id || it?.name, "p" + j),
              name: s(it?.name, 100),
              image: url(it?.image),
              price: n(it?.price),
              features: arr(it?.features, 12).map((x) => s(x, 160)).filter(Boolean),
              visible: it?.visible !== false,
            }))
            .filter((it) => it.name),
          "id"
        ),
      })),
    "id",
    ["home", "ids", "pay"] // these names are used by the site itself
  );

  const seen = new Set();
  const ids = [];
  for (const x of arr(d.ids, 20000)) {
    const id = s(x?.id, 20).replace(/\D/g, "");
    if (id.length < 4 || seen.has(id)) continue;
    seen.add(id);
    ids.push({ id, price: n(x?.price), sold: !!x?.sold });
  }

  const ads = uniq(
    arr(d.ads, 30).map((a, i) => ({
      id: slug(a?.id, "ad" + i),
      title: s(a?.title, 120),
      text: s(a?.text, 400),
      image: url(a?.image),
      link: url(a?.link),
      buttonText: s(a?.buttonText, 40),
      placement: a?.placement === "popup" ? "popup" : "banner",
      active: !!a?.active,
    })),
    "id"
  );

  const faq = arr(d.faq, 30)
    .map((f) => ({ q: s(f?.q, 200), a: s(f?.a, 600) }))
    .filter((f) => f.q);

  const safety = arr(d.safety, 12)
    .map((x) => ({ icon: s(x?.icon, 8), title: s(x?.title, 80), text: s(x?.text, 300) }))
    .filter((x) => x.title);

  return { updatedAt: new Date().toISOString(), settings, payments, categories, ids, ads, faq, safety };
}
