(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/))/i.test(u || "") ? u : "");
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const money = (n) => "Rs. " + Number(n).toLocaleString("en-US");

let D = null;
let cart = lsGet("udithCart2", []);
let wish = lsGet("udithWish", []);
let orders = lsGet("udithOrders", []);
let shown = 60, onlySaved = false;

const STORE = () => D.settings.storeName;
const wa = (m) => "https://wa.me/" + D.settings.whatsapp + "?text=" + encodeURIComponent(m);
const cats = () => D.categories.filter((c) => c.visible !== false);
const items = (c) => c.items.filter((i) => i.visible !== false);
const freeIds = () => D.ids.filter((x) => !x.sold);
const fromPrice = (c) => { const p = items(c).map((i) => i.price).filter((v) => v != null); return p.length ? Math.min(...p) : null; };

let toastTimer;
const note = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1700); };
async function copy(text) { let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch {} note(ok ? "Copied " + text : "Copy unavailable. Select the text instead."); }

async function load() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); if (d && !d.empty && d.settings) return d; }
  } catch {}
  return (await fetch("/data/seed.json")).json(); // first run, or when the API is not reachable
}

/* ---------- views ---------- */
function show(k) {
  const keys = ["home", "ids", "pay", "free-likes", ...cats().map((c) => c.id)];
  if (!keys.includes(k)) k = "home";
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v.id === "v-" + k));
  window.scrollTo(0, 0);
  try { history.replaceState(null, "", k === "home" ? location.pathname + location.search : "#" + k); } catch {}
}

/* ---------- cart ---------- */
function lookup(key) {
  const [t, a, b] = key.split("|");
  if (t === "i") { const x = D.ids.find((i) => i.id === a && !i.sold); return x ? { name: "Rare ID " + x.id, price: x.price } : null; }
  const c = D.categories.find((c) => c.id === a);
  const it = c && c.items.find((i) => i.id === b);
  return it && it.visible !== false ? { name: it.name, price: it.price } : null;
}
const cartLines = () => cart.map((x) => ({ ...x, ...lookup(x.key) })).filter((x) => x.name);
const sum = (ls) => ls.reduce((s, x) => s + (x.price || 0) * x.q, 0);
const payM = () => D.payments.find((p) => p.id === $("oPay").value) || D.payments[0] || { name: "WhatsApp", fee: 0 };
function saveCart() { lsSet("udithCart2", cart); renderCart(); }
function renderCart() {
  const ls = cartLines();
  cart = ls.map(({ key, q }) => ({ key, q })); // drops items that were removed from the store
  $("cartCount").textContent = ls.reduce((n, x) => n + x.q, 0);
  $("cartItems").innerHTML = ls.length
    ? ls.map((x) => `<div class="row"><div><b>${esc(x.name)}</b><small>${x.price != null ? money(x.price) : "Price on WhatsApp"} · Qty ${x.q}</small></div><button class="copy" data-rm="${esc(x.key)}">remove</button></div>`).join("")
    : '<p class="mu">Your cart is empty. Add IDs or plans.</p>';
  totals();
}
function totals() {
  const ls = cartLines(), t = sum(ls), pm = payM(), f = t && pm.fee ? pm.fee : 0;
  const unpriced = ls.some((x) => x.price == null);
  $("cartTotal").textContent = t
    ? "Total " + money(t) + (f ? " + " + pm.name + " fee " + money(f) + " = " + money(t + f) : "") + (unpriced ? " (+ items priced on WhatsApp)" : "")
    : ls.length ? "Prices are confirmed on WhatsApp." : "";
}
function renderOrders() {
  $("orderHist").innerHTML = orders.length
    ? "<h3 style='margin:18px 0 6px;font-size:1rem'>My orders on this device</h3>" + orders.slice(0, 5).map((o) => `<div class="row"><div><b>${esc(o.id)}</b><small>${esc(o.date)} · ${esc(o.total)}</small></div><a class="copy" target="_blank" rel="noopener" href="${esc(wa("Hello " + STORE() + ", I paid for order " + o.id + ". Sending my slip."))}">send slip</a></div>`).join("")
    : "";
}
function checkout() {
  const ls = cartLines();
  if (!ls.length) return note("Your cart is empty");
  const name = $("oName").value.trim(), uid = $("oUid").value.trim();
  if (!name || !uid) return note("Enter your name and UID or phone model");
  const t = sum(ls), pm = payM(), f = t && pm.fee ? pm.fee : 0;
  const id = "UDS-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const tot = t ? money(t + f) : "To be confirmed";
  const msg = "Hello " + STORE() + ", new order " + id + "\nName: " + name + "\nUID / phone: " + uid + "\nPayment: " + pm.name + "\n" +
    ls.map((x) => "• " + x.name + " x" + x.q + (x.price != null ? " (" + money(x.price) + ")" : "")).join("\n") +
    "\nTotal: " + tot + (ls.some((x) => x.price == null) ? " (+ items priced on WhatsApp)" : "") + "\nPlease confirm availability and payment details.";
  orders.unshift({ id, date: new Date().toLocaleDateString(), total: tot });
  orders = orders.slice(0, 20); lsSet("udithOrders", orders); renderOrders();
  window.open(wa(msg), "_blank", "noopener");
}

/* ---------- render helpers ---------- */
const planCard = (c, i) => {
  const ask = i.price == null;
  const msg = "Hello " + STORE() + ", I want to order: " + i.name + (ask ? "" : " (" + money(i.price) + ")") + ". " + (c.ask || "");
  return `<div class="plan">${i.image ? `<img class="product-image" src="${esc(safeUrl(i.image))}" alt="${esc(i.name)}">` : `<div class="product-image product-image-empty" aria-label="Photo not uploaded">📷</div>`}<h3>${esc(i.name)}</h3><div class="price">${ask ? "Ask for price" : money(i.price)}</div>` +
    (i.features && i.features.length ? `<ul>${i.features.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "") +
    `<a class="btn sm" target="_blank" rel="noopener" href="${esc(wa(msg))}">${ask ? "Ask for price" : "Order this plan"}</a>` +
    `<button class="btn line sm" data-add="${esc("p|" + c.id + "|" + i.id)}">＋ Add to cart</button></div>`;
};
const adHtml = (a) => {
  const img = safeUrl(a.image), link = safeUrl(a.link);
  return `<div class="ad">${img ? `<img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy">` : ""}<div class="ad-body">${a.title ? `<h3>${esc(a.title)}</h3>` : ""}${a.text ? `<p>${esc(a.text)}</p>` : ""}${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">${esc(a.buttonText || "Learn more")}</a>` : ""}</div></div>`;
};
const dots = (t, n = 22) => t + " " + ".".repeat(Math.max(2, n - t.length)) + " ";

function renderHome() {
  const s = D.settings, parts = s.storeName.split(" "), first = parts.shift() || "";
  document.title = s.storeName + " | Free Fire Likes, Glory Bots, FF SENSI & IDs";
  $("hTitle").innerHTML = `<b>${esc(first)}</b> ${esc(parts.join(" "))}`;
  $("hText").textContent = s.heroText;
  $("logo").innerHTML = esc(first.toUpperCase()) + (parts.length ? `<span> ${esc(parts.join(" ").toUpperCase())}</span>` : "");
  $("termName").textContent = s.storeName.toLowerCase().replace(/\s+/g, "-") + "@lk:~";
  $("footStore").textContent = s.storeName.toUpperCase().replace(/\s+/g, " ");
  $("footText").textContent = s.footerText;
  $("footNum").textContent = s.whatsappDisplay;
  $("ctaNum").textContent = s.whatsappDisplay;
  $("banner").textContent = s.bannerText ? "> " + s.bannerText : "";
  $("banner").hidden = !s.bannerText;

  // ticker: custom lines from admin, or automatic from the plans
  const auto = cats().map((c) => (fromPrice(c) != null ? c.title + (items(c).length > 1 ? " from " : " ") + money(fromPrice(c)) : null)).filter(Boolean);
  const lines = s.tickerLines.length ? s.tickerLines : [...auto, freeIds().length + " Rare IDs", "Order on WhatsApp"];
  $("ticker").textContent = lines.join(" // ") + " //";

  // stats strip
  $("sIds").textContent = freeIds().length.toLocaleString("en-US");
  $("sPlans").textContent = cats().reduce((n, c) => n + items(c).length, 0);
  const mins = cats().map(fromPrice).filter((v) => v != null);
  $("sFrom").textContent = mins.length ? money(Math.min(...mins)) : "-";

  // ads (banner placement)
  $("adsBanner").innerHTML = D.ads.filter((a) => a.active && a.placement !== "popup").map(adHtml).join("");

  // tiles
  $("tiles").innerHTML =
    cats().map((c) => `<button class="tile ${c.hot ? "hot" : ""}" data-go="${esc(c.id)}">${c.items?.find(x => x.image)?.image ? `<img class="tile-image" src="${esc(safeUrl(c.items.find(x => x.image).image))}" alt="${esc(c.title)}">` : `<span class="ic">${esc(c.icon)}</span>`}<h3>${esc(c.title)}</h3><small>${esc(c.desc)}</small><span class="go">Top Up →</span></button>`).join("") +
    `<button class="tile" data-go="ids"><span class="ic">✦</span><h3>Rare IDs</h3><small>Search ${freeIds().length} rare IDs</small><span class="go">View IDs →</span></button>` +
    `<button class="tile" data-go="pay"><span class="ic">💳</span><h3>Payment methods</h3><small>${esc(D.payments.map((p) => p.name).join(" and ") || "Ask on WhatsApp")}</small><span class="go">View details →</span></button>` +
    `<button class="tile" data-go="free-likes"><span class="ic">🎁</span><h3>Free Likes</h3><small>Send a Free Likes UID request directly</small><span class="go">Send Free Likes Request →</span></button>`;

  $("safeGrid").innerHTML = D.safety.map((x) => `<div class="box"><h3>${esc(x.icon)} ${esc(x.title)}</h3><p class="mu">${esc(x.text)}</p></div>`).join("");
  $("faqList").innerHTML = D.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");

  const w = wa("Hello " + STORE() + ", I need help.");
  ["navWa", "footWa", "fab", "ctaWa"].forEach((id) => ($(id).href = w));
  $("slipWa").href = wa("Hello " + STORE() + ", I have made a payment. Sending my slip now.");
  $("footChips").innerHTML = cats().map((c) => `<button class="chip" data-go="${esc(c.id)}">${esc(c.title)}</button>`).join("") + '<button class="chip" data-go="ids">Rare IDs</button><button class="chip" data-go="pay">Payments</button><button class="chip" data-go="free-likes">Free Likes</button>';

  typeTerminal(s, lines);
}

function typeTerminal(s, tickerLines) {
  const rows = cats().slice(0, 3).filter((c) => fromPrice(c) != null).map((c) => ["ok", "[+] " + dots(c.title) + (items(c).length > 1 ? "from " : "") + money(fromPrice(c))]);
  const lines = [["mu", "$ " + s.storeName.toLowerCase().replace(/\s+/g, "-") + " --list"], ...rows, ["cy", "[*] order via WhatsApp"], ["mu", "$ _"]];
  const tty = $("tty");
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) { tty.innerHTML = lines.map((l) => `<span class="${l[0]}">${esc(l[1])}</span>`).join("\n"); return; }
  let i = 0, j = 0, html = "";
  (function tick() {
    if (i >= lines.length) { tty.innerHTML = html + '<span class="cur"></span>'; return; }
    const [c, t] = lines[i]; j++;
    tty.innerHTML = html + `<span class="${c}">${esc(t.slice(0, j))}</span><span class="cur"></span>`;
    if (j >= t.length) { html += `<span class="${c}">${esc(t)}</span>\n`; i++; j = 0; setTimeout(tick, 240); } else setTimeout(tick, 22);
  })();
}

function renderCategories() {
  $("views").innerHTML = cats().map((c) =>
    `<div class="view" id="v-${esc(c.id)}"><div class="wrap"><button class="btn line sm back" data-go="home">← All categories</button><div class="head"><h2>${esc(c.title)}</h2><p>${esc(c.desc)}. Tap Order and your WhatsApp message is ready.</p></div><div class="plans">${items(c).map((i) => planCard(c, i)).join("")}</div>${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}</div></div>`
  ).join("");
}

function renderPayments() {
  $("payGrid").innerHTML = D.payments.length
    ? D.payments.map((p) => `<div class="box"><h3>${esc(p.icon)} ${esc(p.name)}</h3>${p.rows.map((r) => `<div class="row"><div><small>${esc(r.label)}</small><b>${esc(r.value)}</b></div><button class="copy" data-c="${esc(r.value)}">copy</button></div>`).join("")}${p.fee ? `<span class="fee">Service fee: ${money(p.fee)}</span>` : ""}</div>`).join("")
    : '<div class="box"><p class="mu">Ask us on WhatsApp for payment details.</p></div>';
  $("oPay").innerHTML = D.payments.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.fee ? " (+" + money(p.fee) + " fee)" : ""}</option>`).join("");
}

/* ---------- rare IDs ---------- */
function idList() {
  const v = $("q").value.trim(), p = $("pre").value, s = $("sort").value;
  let l = freeIds().filter((x) => x.id.includes(v) && (!p || x.id.startsWith(p)) && (!onlySaved || wish.includes(x.id)));
  if (s === "asc") l = [...l].sort((a, b) => a.id - b.id);
  if (s === "desc") l = [...l].sort((a, b) => b.id - a.id);
  if (s === "price") l = [...l].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return l;
}
const idCard = (x) => {
  const ask = x.price == null;
  const msg = "Hello " + STORE() + ", I’m interested in Free Fire ID " + x.id + (ask ? ". Is it available and what’s the price?" : " (" + money(x.price) + "). Is it available?");
  return `<div class="id"><div class="idtop"><strong>${esc(x.id)}</strong><button class="heart" data-wish="${esc(x.id)}" aria-label="Save ID ${esc(x.id)}">${wish.includes(x.id) ? "♥" : "♡"}</button></div><div class="idprice">${ask ? "Price on request" : money(x.price)}</div><a class="btn sm" target="_blank" rel="noopener" href="${esc(wa(msg))}">${ask ? "Ask price" : "Order this ID"}</a><button class="btn line sm" data-add="${esc("i|" + x.id)}">＋ Add to cart</button></div>`;
};
function drawIds(reset) {
  if (reset) shown = 60;
  const l = idList();
  $("cnt").textContent = l.length.toLocaleString("en-US") + " IDs found. Confirm availability on WhatsApp.";
  $("idGrid").innerHTML = l.length
    ? l.slice(0, shown).map(idCard).join("")
    : `<div class="empty">No IDs match that search. Tell us the number you want and we’ll look for it.<br><a class="btn sm" style="margin-top:12px" target="_blank" rel="noopener" href="${esc(wa("Hello " + STORE() + ", I’m looking for a rare Free Fire ID."))}">Ask on WhatsApp</a></div>`;
  $("more").hidden = l.length <= shown;
  $("more").textContent = "Show more (" + (l.length - shown) + " left)";
}
function setupIds() {
  const pres = [...new Set(freeIds().map((x) => x.id.slice(0, 2)))].sort();
  $("pre").innerHTML = '<option value="">All series</option>' + pres.map((p) => `<option value="${esc(p)}">${esc(p)}… series</option>`).join("");
  $("chips").innerHTML = ["000", "111", "555", "777", "999", "Saved ♥"].map((p) => `<button class="chip" data-chip="${esc(p)}">${esc(p)}</button>`).join("") + '<button class="chip" data-chip="">Clear</button>';
  $("chips").onclick = (e) => {
    const b = e.target.closest("[data-chip]"); if (!b) return;
    const p = b.dataset.chip; onlySaved = p.startsWith("Saved");
    $("q").value = onlySaved || !p ? "" : p; drawIds(true);
  };
  $("q").oninput = () => drawIds(true);
  $("sort").onchange = () => drawIds(true);
  $("pre").onchange = () => drawIds(true);
  $("more").onclick = () => { shown += 60; drawIds(); };
  $("reqBtn").onclick = () => window.open(wa("Hello " + STORE() + ", I’m looking for this Free Fire ID or pattern: " + $("reqId").value.trim()), "_blank", "noopener");
  drawIds(true);
}

/* ---------- Free Likes: direct anonymous request ---------- */
function flMessage(message, isError = false) {
  const el = $("flMessage");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "var(--r)" : "var(--muted)";
}
function initFreeLikes() {
  $("flRequestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const gameUid = $("flUid").value.trim();
    if (!/^[0-9]{5,20}$/.test(gameUid)) return flMessage("Enter a valid Free Fire UID (5–20 digits).", true);
    const submit = $("flRequestForm").querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const response = await fetch("/api/free-likes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameUid }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send request.");
      $("flUid").value = "";
      flMessage("Request sent successfully! Your request ID is " + result.request.id + ". Save this ID.");
    } catch (error) { flMessage(error.message, true); }
    finally { submit.disabled = false; }
  });
}

/* ---------- customer sign-in / registration ---------- */
function initCustomerGate() {
  const gate = $("customerGate"), phone = $("customerPhone"), password = $("customerPassword");
  const signedPhone = localStorage.getItem("udithCustomerPhone") || "";
  if (signedPhone) gate.classList.add("hidden");
  function setAccountButton() {
    const active = Boolean(localStorage.getItem("udithCustomerPhone"));
    $("accountBtn").textContent = active ? "Log out" : "My account";
    $("accountBtn").onclick = () => {
      if (localStorage.getItem("udithCustomerPhone")) {
        localStorage.removeItem("udithCustomerPhone");
        password.value = ""; phone.value = ""; gate.classList.remove("hidden");
        setAccountButton();
      } else { gate.classList.remove("hidden"); }
    };
  }
  setAccountButton();
  $("guestContinue").onclick = () => gate.classList.add("hidden");
  async function auth(action) {
    $("customerMessage").textContent = "Please wait…";
    const buttons = gate.querySelectorAll("button"); buttons.forEach(b => b.disabled = true);
    try {
      const response = await fetch("/api/customer-auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, phone: phone.value, password: password.value }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      localStorage.setItem("udithCustomerPhone", result.customer.phone);
      setAccountButton();
      $("customerMessage").textContent = "Welcome! Your account is saved.";
      password.value = "";
      setTimeout(() => gate.classList.add("hidden"), 450);
    } catch (error) { $("customerMessage").textContent = error.message; }
    finally { buttons.forEach(b => b.disabled = false); }
  }
  $("customerForm").addEventListener("submit", e => { e.preventDefault(); auth("login"); });
  $("customerRegister").onclick = () => auth("register");
}

/* ---------- ads popup ---------- */

function showPopupAd() {
  const key = (a) => "udithAd_" + a.id;
  const seen = (a) => { try { return sessionStorage.getItem(key(a)); } catch { return null; } };
  const pop = D.ads.find((a) => a.active && a.placement === "popup" && !seen(a));
  if (!pop) return;
  setTimeout(() => {
    $("adPopupBody").innerHTML = adHtml(pop);
    $("adPopup").classList.add("open");
    try { sessionStorage.setItem(key(pop), "1"); } catch {}
  }, 1200);
}

/* ---------- decorative canvases (kept light for budget phones) ---------- */
function liveBg() {
  const cv = $("live-bg");
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) { cv.remove(); return; }
  const ctx = cv.getContext("2d"); if (!ctx) return;
  const css = getComputedStyle(document.documentElement);
  const G = css.getPropertyValue("--g").trim() || "#3dff8b", C = css.getPropertyValue("--c").trim() || "#22e4ff";
  let w, h, pts, raf;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(45, Math.max(20, Math.floor((w * h) / 22000)));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, r: Math.random() * 1.8 + 1 }));
  };
  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; a.x += a.vx; a.y += a.vy;
      if (a.x < -10) a.x = w + 10; if (a.x > w + 10) a.x = -10; if (a.y < -10) a.y = h + 10; if (a.y > h + 10) a.y = -10;
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 150) { ctx.globalAlpha = (1 - d / 150) * 0.45; ctx.strokeStyle = i % 3 ? G : C; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      ctx.globalAlpha = 0.8; ctx.fillStyle = i % 4 ? G : C; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; raf = requestAnimationFrame(frame);
  };
  resize(); frame();
  addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); if (!document.hidden) frame(); });
}
function codeRain() {
  const c = $("rain"); if (!c || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const x = c.getContext("2d"), ch = "01ABCDEF$#<>/", fs = 16; let drops = [];
  const size = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; drops = Array.from({ length: Math.floor(c.width / fs) }, () => Math.random() * -30); };
  size(); addEventListener("resize", size);
  const col = getComputedStyle(document.documentElement).getPropertyValue("--g").trim() || "#3dff8b";
  setInterval(() => {
    if (document.hidden || !c.offsetParent) return;
    if (c.width !== c.offsetWidth) size();
    x.globalCompositeOperation = "destination-out"; x.fillStyle = "rgba(0,0,0,.14)"; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "source-over"; x.fillStyle = col; x.font = fs + "px monospace";
    drops.forEach((d, i) => { x.fillText(ch[(Math.random() * ch.length) | 0], i * fs, d * fs); drops[i] = d * fs > c.height && Math.random() > 0.975 ? 0 : d + 1; });
  }, 90);
}

/* ---------- start ---------- */
async function init() {
  D = await load();
  renderHome(); renderCategories(); renderPayments(); setupIds(); renderCart(); renderOrders(); showPopupAd(); initFreeLikes(); initCustomerGate();

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]"); if (go) show(go.dataset.go);
    const add = e.target.closest("[data-add]");
    if (add) { const f = cart.find((x) => x.key === add.dataset.add); if (f) f.q++; else cart.push({ key: add.dataset.add, q: 1 }); saveCart(); note("Added to cart"); }
    const rm = e.target.closest("[data-rm]"); if (rm) { cart = cart.filter((x) => x.key !== rm.dataset.rm); saveCart(); }
    const cp = e.target.closest("[data-c]"); if (cp) copy(cp.dataset.c);
    const w = e.target.closest("[data-wish]");
    if (w) { const id = w.dataset.wish; wish = wish.includes(id) ? wish.filter((x) => x !== id) : [...wish, id]; lsSet("udithWish", wish); drawIds(); }
    if (e.target.id === "adPopup") $("adPopup").classList.remove("open");
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") { $("adPopup").classList.remove("open"); $("cartDrawer").classList.remove("open"); } });
  addEventListener("hashchange", () => show(location.hash.slice(1)));

  $("adClose").onclick = () => $("adPopup").classList.remove("open");
  $("cartOpen").onclick = () => $("cartDrawer").classList.add("open");
  $("cartClose").onclick = () => $("cartDrawer").classList.remove("open");
  $("cartDrawer").addEventListener("click", (e) => { if (e.target.id === "cartDrawer") $("cartDrawer").classList.remove("open"); });
  $("oPay").onchange = totals;
  $("checkout").onclick = checkout;

  const hs = $("hs");
  hs.oninput = () => {
    const v = hs.value.trim().toLowerCase();
    document.querySelectorAll("#tiles .tile").forEach((t) => { t.style.display = !v || t.textContent.toLowerCase().includes(v) || (/^\d+$/.test(v) && t.dataset.go === "ids") ? "" : "none"; });
  };
  hs.onkeydown = (e) => { if (e.key === "Enter" && /^\d{3,}$/.test(hs.value.trim())) { $("q").value = hs.value.trim(); show("ids"); drawIds(true); } };
  $("trackBtn").onclick = () => { const v = $("trackId").value.trim(); if (!v) return note("Enter your Order ID"); window.open(wa("Hello " + STORE() + ", what is the status of my order " + v + "?"), "_blank", "noopener"); };
  $("copyNum").onclick = () => copy("+" + D.settings.whatsapp);
  const tt = $("toTop");
  addEventListener("scroll", () => { tt.hidden = scrollY < 500; }, { passive: true });
  tt.onclick = () => scrollTo({ top: 0, behavior: "smooth" });

  show(location.hash.slice(1) || "home");
  liveBg(); codeRain();
}
init().catch((e) => { console.error(e); const l = $("loading"); if (l) l.textContent = "Could not load the store. Please refresh the page."; });
})();
