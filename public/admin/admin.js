(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = (p) => p + Math.random().toString(36).slice(2, 7);
const PAGE = 100;

let D = null, dirty = false, tab = "plans";
const idv = { q: "", f: "all", page: 0, sel: new Set() };

/* ---------- small helpers ---------- */
let toastTimer;
const note = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200); };
function setState(text, cls = "") { const s = $("state"); s.textContent = text; s.className = "state " + cls; }
function markDirty() { dirty = true; setState("Unsaved changes", "dirty"); }
const token = () => sessionStorage.getItem("udithAdminToken") || "";

async function api(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { "content-type": "application/json", authorization: "Bearer " + token(), ...(opt.headers || {}) } });
  if (r.status === 401) { showLogin("Session expired. Log in again. Your unsaved changes are kept."); throw new Error("Session expired"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

function normalize(d) {
  d = d || {};
  d.settings = { storeName: "UDITH STORE", whatsapp: "", whatsappDisplay: "", heroText: "", bannerText: "", footerText: "", tickerLines: [], ...(d.settings || {}) };
  for (const k of ["payments", "categories", "ids", "ads", "faq", "safety"]) if (!Array.isArray(d[k])) d[k] = [];
  d.categories.forEach((c) => { if (!Array.isArray(c.items)) c.items = []; });
  d.payments.forEach((p) => { if (!Array.isArray(p.rows)) p.rows = []; });
  return d;
}

async function loadData() {
  let d = null;
  try { const r = await fetch("/api/data", { cache: "no-store" }); const j = await r.json(); if (j && !j.empty && j.settings) d = j; } catch {}
  if (!d) { d = await (await fetch("/data/seed.json")).json(); D = normalize(d); markDirty(); setState("Starter data loaded. Press Save to publish it.", "dirty"); return; }
  D = normalize(d); dirty = false; setState("Loaded");
}

/* ---------- login ---------- */
function showLogin(msg = "") { $("app").hidden = true; $("login").hidden = false; $("loginErr").textContent = msg; $("pw").value = ""; }
async function enterApp() {
  $("login").hidden = true; $("app").hidden = false;
  if (!D) { try { await loadData(); } catch (e) { setState("Could not load data", "err"); D = normalize({}); } }
  renderTab();
}
async function doLogin() {
  $("loginErr").textContent = "";
  try {
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Login failed");
    sessionStorage.setItem("udithAdminToken", j.token);
    enterApp();
  } catch (e) { $("loginErr").textContent = e.message; }
}

/* ---------- save ---------- */
async function save() {
  setState("Saving…");
  try {
    const r = await api("/api/save", { method: "POST", body: JSON.stringify(D) });
    D = normalize(r.data); dirty = false; setState("Saved " + new Date().toLocaleTimeString()); note("Saved. Your site is updated.");
    renderTab();
  } catch (e) { setState(e.message, "err"); note(e.message); }
}

/* ---------- generic form bits ---------- */
const field = (label, path, val, o = {}) =>
  `<div class="f"><label>${label}</label>` +
  (o.area
    ? `<textarea rows="${o.rows || 3}" data-bind="${path}" ${o.lines ? 'data-type="lines"' : ""}>${esc(o.lines ? (val || []).join("\n") : val)}</textarea>`
    : `<input ${o.num ? 'type="number" min="0" data-type="num"' : ""} data-bind="${path}" value="${esc(val ?? "")}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""}>`) +
  `</div>`;
const check = (label, path, on) => `<label class="chk"><input type="checkbox" data-bind="${path}" ${on ? "checked" : ""}> ${label}</label>`;

function readEl(el) {
  if (el.type === "checkbox") return el.checked;
  const t = el.dataset.type;
  if (t === "num") { const v = el.value.trim(); return v === "" ? null : Math.max(0, Math.round(Number(v)) || 0); }
  if (t === "lines") return el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  return el.value;
}
function setPath(path, val) {
  const ks = path.split("."); let o = D;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = val;
}
const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; };

/* ---------- tabs ---------- */
function renderTab() {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  const body = $("tabBody");
  if (tab === "plans") body.innerHTML = plansHtml();
  else if (tab === "ids") { body.innerHTML = idsShell(); drawIdRows(); }
  else if (tab === "free-likes") { body.innerHTML = freeLikesHtml(); loadFreeLikes(); }
  else if (tab === "customers") { body.innerHTML = `<div class="card"><div class="cardhead"><h3>Customer accounts</h3><button class="btn line sm" data-act="customersRefresh">↻ Refresh</button></div><p class="help">WhatsApp numbers and account dates. Passwords are never displayed or stored in plain text.</p><div id="customerRows">Loading…</div></div>`; loadCustomers(); }
  else if (tab === "ads") body.innerHTML = adsHtml();
  else if (tab === "pay") body.innerHTML = payHtml();
  else if (tab === "text") body.innerHTML = textHtml();
  else if (tab === "backup") body.innerHTML = backupHtml();
  else body.innerHTML = plansHtml();
}

function plansHtml() {
  return `<p class="help">Change any price here, add new plans, or add a whole new category. Leave the price empty to show “Ask for price”. Press <b>Save changes</b> when you are done.</p>
  <div class="tools"><button class="btn sm" data-act="addCat">＋ Add category</button></div>` +
  D.categories.map((c, ci) => `<div class="card">
    <div class="cardhead"><h3>${esc(c.icon)} ${esc(c.title) || "New category"}</h3><div class="tools" style="margin:0">
      <button class="btn line sm" data-act="catUp" data-i="${ci}" aria-label="Move up">↑</button><button class="btn line sm" data-act="catDown" data-i="${ci}" aria-label="Move down">↓</button>
      <button class="btn danger sm" data-act="delCat" data-i="${ci}">Delete category</button></div></div>
    <div class="grid2">${field("Title", `categories.${ci}.title`, c.title)}${field("Icon (one emoji)", `categories.${ci}.icon`, c.icon)}
      ${field("Short description", `categories.${ci}.desc`, c.desc)}${field("Order message ends with (e.g. “My Free Fire UID is: ”)", `categories.${ci}.ask`, c.ask)}</div>
    ${field("Note shown under the plans (optional)", `categories.${ci}.note`, c.note)}
    <div class="tools">${check("Show on site", `categories.${ci}.visible`, c.visible !== false)}${check("Highlight (HOT)", `categories.${ci}.hot`, c.hot)}</div>
    <div class="tablewrap"><table class="t"><tr><th>Plan name</th><th>Price (Rs.)</th><th>Details (one per line)</th><th>Show</th><th></th></tr>
    ${c.items.map((it, ii) => `<tr>
      <td><input data-bind="categories.${ci}.items.${ii}.name" value="${esc(it.name)}"></td>
      <td><input type="number" min="0" data-type="num" data-bind="categories.${ci}.items.${ii}.price" value="${it.price ?? ""}" placeholder="Ask for price"></td>
      <td><textarea rows="2" data-type="lines" data-bind="categories.${ci}.items.${ii}.features">${esc((it.features || []).join("\n"))}</textarea></td>
      <td><input type="checkbox" data-bind="categories.${ci}.items.${ii}.visible" ${it.visible !== false ? "checked" : ""}></td>
      <td><button class="btn danger sm" data-act="delItem" data-i="${ci}" data-j="${ii}" aria-label="Delete plan">✕</button></td></tr>`).join("")}</table></div>
    <div class="product-photo-list"><h4>Product photos — upload a separate photo for every plan</h4>
    ${c.items.map((it, ii) => `<div class="product-photo-editor"><div class="product-photo-preview">${it.image ? `<img class="preview" src="${esc(it.image)}" alt="${esc(it.name)} photo">` : `<span>📷</span><small>No photo yet</small>`}</div><div class="product-photo-controls"><b>${esc(it.name)}</b><label>Choose photo from your phone / computer</label><input type="file" accept="image/*" data-product-upload="${ci},${ii}"><input data-bind="categories.${ci}.items.${ii}.image" value="${esc(it.image || "")}" placeholder="Or paste an image URL"><div class="tools"><button class="btn line sm" type="button" data-act="removeProductImage" data-i="${ci}" data-j="${ii}" ${it.image ? "" : "disabled"}>Remove photo</button></div></div></div>`).join("")}
    </div>
    <button class="btn line sm" data-act="addItem" data-i="${ci}">＋ Add plan</button></div>`).join("");
}

/* ---- Free Likes requests ---- */
function freeLikesHtml() {
  return `<div class="card"><div class="cardhead"><div><h3>Free Likes requests</h3><p class="help">Direct UID requests from visitors. Update the status or permanently delete a request.</p></div><button class="btn line sm" data-act="freeLikesRefresh">↻ Refresh</button></div><div id="flAdminRequests"><p class="mu">Loading requests…</p></div></div>`;
}
async function loadFreeLikes() {
  const target = $("flAdminRequests");
  if (!target) return;
  target.innerHTML = '<p class="mu">Loading requests…</p>';
  try {
    const data = await api("/api/free-likes-admin", { method: "GET" });
    const requests = Array.isArray(data.requests) ? data.requests : [];
    if (!$("flAdminRequests")) return;
    if (!requests.length) {
      $("flAdminRequests").innerHTML = '<p class="mu">No Free Likes requests yet.</p>';
      return;
    }
    requests.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const count = requests.reduce((acc, request) => { acc[request.status] = (acc[request.status] || 0) + 1; return acc; }, {});
    const summary = `<p class="help">Total: <b>${requests.length}</b> · Pending: <b>${count.Pending || 0}</b> · Processing: <b>${count.Processing || 0}</b> · Like Done: <b>${count["Like Done"] || 0}</b></p>`;
    const rows = requests.map((request) => {
      const created = request.createdAt ? new Date(request.createdAt).toLocaleString() : "—";
      const status = String(request.status || "Pending");
      const options = ["Pending", "Processing", "Like Done"].map((value) => `<button class="btn ${value === status ? "sm" : "line sm"}" data-act="freeLikesSetStatus" data-id="${esc(request.id)}" data-status="${esc(value)}" ${value === status ? "disabled" : ""}>${esc(value)}</button>`).join(" ");
      return `<tr><td><b>${esc(request.id)}</b><br><span class="mu">${esc(created)}</span></td><td>${esc(request.username || "Guest")}</td><td><b>${esc(request.gameUid || "—")}</b></td><td>${esc(status)}</td><td><div class="tools" style="margin:0">${options}<button class="btn danger sm" data-act="freeLikesDelete" data-id="${esc(request.id)}">Delete</button></div></td></tr>`;
    }).join("");
    $("flAdminRequests").innerHTML = summary + `<div class="tablewrap"><table class="t"><tr><th>Request / date</th><th>Player</th><th>Free Fire UID</th><th>Status</th><th>Update / delete</th></tr>${rows}</table></div>`;
  } catch (error) {
    if ($("flAdminRequests")) $("flAdminRequests").innerHTML = `<p class="err">${esc(error.message)}</p><button class="btn line sm" data-act="freeLikesRefresh">Try again</button>`;
  }
}

async function loadCustomers() {
  const target = $("customerRows"); if (!target) return;
  try {
    const data = await api("/api/customer-admin", { method: "GET" });
    const rows = Array.isArray(data.customers) ? data.customers : [];
    target.innerHTML = rows.length ? `<div class="tablewrap"><table class="t"><tr><th>WhatsApp number</th><th>Registered</th><th>Last login</th></tr>${rows.map(x => `<tr><td><b>${esc(x.phone)}</b></td><td>${esc(x.createdAt ? new Date(x.createdAt).toLocaleString() : "—")}</td><td>${esc(x.lastLoginAt ? new Date(x.lastLoginAt).toLocaleString() : "—")}</td></tr>`).join("")}</table></div><p class="help">Total accounts: ${rows.length}</p>` : '<p class="mu">No customer accounts yet.</p>';
  } catch (e) { target.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

/* ---- Rare IDs ---- */
function idsShell() {
  return `<div class="card"><h3>Add IDs</h3>
    <div class="f"><label>Paste IDs (separate with space, comma or new line)</label><textarea id="newIds" rows="3" placeholder="17333330881 17333330880 ..."></textarea></div>
    <div class="grid2"><div class="f"><label>Price for these IDs (optional)</label><input id="newPrice" type="number" min="0" placeholder="Leave empty = Price on request"></div>
    <div class="f"><label>&nbsp;</label><button class="btn" data-act="addIds">Add IDs</button></div></div></div>
  <div class="card"><div class="cardhead"><h3>Rare IDs <span class="mu" id="idCount"></span></h3></div>
    <div class="tools"><input id="idSearch" placeholder="Search ID…" style="max-width:240px">
      <select id="idFilter"><option value="all">All IDs</option><option value="priced">With price</option><option value="noprice">No price yet</option><option value="sold">Sold / hidden</option></select></div>
    <div class="tools"><input id="bulkPrice" type="number" min="0" placeholder="Price" style="max-width:130px">
      <button class="btn line sm" data-act="priceSel">Set price: selected</button><button class="btn line sm" data-act="priceFiltered">Set price: all in this list</button>
      <button class="btn line sm" data-act="clearPrice">Clear price: all in this list</button></div>
    <div class="tools"><button class="btn line sm" data-act="selFiltered">Select all in this list</button><button class="btn line sm" data-act="clearSel">Clear selection</button>
      <button class="btn line sm" data-act="soldSel">Mark selected sold</button><button class="btn line sm" data-act="unsoldSel">Mark selected available</button>
      <button class="btn danger sm" data-act="delSel">Delete selected</button> <span class="state" id="selCount"></span></div>
    <div class="tablewrap"><table class="t" id="idTable"></table></div>
    <div class="tools"><button class="btn line sm" data-act="pgPrev">← Previous</button><span id="pgInfo" class="state"></span><button class="btn line sm" data-act="pgNext">Next →</button></div></div>`;
}
function filteredIdx() {
  const out = [];
  D.ids.forEach((x, i) => {
    if (idv.q && !x.id.includes(idv.q)) return;
    if (idv.f === "priced" && x.price == null) return;
    if (idv.f === "noprice" && x.price != null) return;
    if (idv.f === "sold" && !x.sold) return;
    out.push(i);
  });
  return out;
}
function drawIdRows() {
  const list = filteredIdx(), pages = Math.max(1, Math.ceil(list.length / PAGE));
  idv.page = Math.min(idv.page, pages - 1);
  const slice = list.slice(idv.page * PAGE, idv.page * PAGE + PAGE);
  $("idTable").innerHTML = `<tr><th><input type="checkbox" data-act="selPage" aria-label="Select this page"></th><th>ID</th><th>Price (Rs.)</th><th>Sold</th><th></th></tr>` +
    (slice.map((i) => { const x = D.ids[i]; return `<tr><td><input type="checkbox" data-sel="${esc(x.id)}" ${idv.sel.has(x.id) ? "checked" : ""}></td><td><b>${esc(x.id)}</b></td>
      <td><input type="number" min="0" data-type="num" data-bind="ids.${i}.price" value="${x.price ?? ""}" placeholder="Price on request" style="max-width:190px"></td>
      <td><input type="checkbox" data-bind="ids.${i}.sold" ${x.sold ? "checked" : ""}></td>
      <td><button class="btn danger sm" data-act="delId" data-i="${i}" aria-label="Delete ID">✕</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="mu">No IDs in this list.</td></tr>`);
  $("idCount").textContent = `(${list.length} shown of ${D.ids.length})`;
  $("pgInfo").textContent = `Page ${idv.page + 1} of ${pages}`;
  $("selCount").textContent = idv.sel.size ? idv.sel.size + " selected" : "";
}
const bulkPrice = () => { const v = $("bulkPrice").value.trim(); if (v === "") { note("Type a price first"); return undefined; } return Math.max(0, Math.round(Number(v)) || 0); };
const selIdx = () => D.ids.map((x, i) => (idv.sel.has(x.id) ? i : -1)).filter((i) => i >= 0);

/* ---- Ads ---- */
function adsHtml() {
  return `<p class="help">Ads show on the site as a banner above the categories, or as a pop-up (once per visit). Add an image, text and an optional link. Only ads marked <b>Active</b> are shown.</p>
  <div class="tools"><button class="btn sm" data-act="addAd">＋ Add ad</button></div>` +
  (D.ads.map((a, i) => `<div class="card"><div class="cardhead"><h3>${esc(a.title) || "New ad"}</h3><button class="btn danger sm" data-act="delAd" data-i="${i}">Delete ad</button></div>
    <div class="grid2">${field("Title", `ads.${i}.title`, a.title)}
      <div class="f"><label>Where to show</label><select data-bind="ads.${i}.placement"><option value="banner" ${a.placement !== "popup" ? "selected" : ""}>Banner on home page</option><option value="popup" ${a.placement === "popup" ? "selected" : ""}>Pop-up</option></select></div></div>
    ${field("Text", `ads.${i}.text`, a.text, { area: true, rows: 2 })}
    <div class="grid2">${field("Link (optional, starts with https://)", `ads.${i}.link`, a.link)}${field("Button text", `ads.${i}.buttonText`, a.buttonText, { ph: "Learn more" })}</div>
    <div class="f"><label>Image (paste a link, or upload from your phone/PC)</label><input data-bind="ads.${i}.image" value="${esc(a.image)}" placeholder="https://… or uploaded image">
      <div class="tools"><input type="file" accept="image/*" data-upload="${i}" style="max-width:300px">${a.image ? `<img class="preview" src="${esc(a.image)}" alt="Ad preview">` : ""}</div></div>
    <div class="tools">${check("Active (show on site)", `ads.${i}.active`, a.active)}</div></div>`).join("") || `<p class="mu">No ads yet.</p>`);
}

/* ---- Payments ---- */
function payHtml() {
  return `<p class="help">These details appear on the Payment methods page and in the cart. A fee is added to the order total when a method has one.</p>
  <div class="tools"><button class="btn sm" data-act="addPay">＋ Add payment method</button></div>` +
  D.payments.map((p, pi) => `<div class="card"><div class="cardhead"><h3>${esc(p.icon)} ${esc(p.name) || "New method"}</h3><button class="btn danger sm" data-act="delPay" data-i="${pi}">Delete method</button></div>
    <div class="grid2">${field("Name", `payments.${pi}.name`, p.name)}${field("Icon (one emoji)", `payments.${pi}.icon`, p.icon)}</div>
    ${field("Service fee (Rs., 0 = none)", `payments.${pi}.fee`, p.fee, { num: true })}
    <div class="tablewrap"><table class="t"><tr><th>Label (e.g. Account number)</th><th>Value</th><th></th></tr>
    ${p.rows.map((r, ri) => `<tr><td><input data-bind="payments.${pi}.rows.${ri}.label" value="${esc(r.label)}"></td><td><input data-bind="payments.${pi}.rows.${ri}.value" value="${esc(r.value)}"></td>
      <td><button class="btn danger sm" data-act="delRow" data-i="${pi}" data-j="${ri}" aria-label="Delete row">✕</button></td></tr>`).join("")}</table></div>
    <button class="btn line sm" data-act="addRow" data-i="${pi}">＋ Add row</button></div>`).join("");
}

/* ---- Site text ---- */
function textHtml() {
  const s = D.settings;
  return `<div class="card"><h3>Store</h3><div class="grid2">${field("Store name", "settings.storeName", s.storeName)}${field("WhatsApp number (digits only, with country code)", "settings.whatsapp", s.whatsapp, { ph: "94722124765" })}
    ${field("Number shown on the site", "settings.whatsappDisplay", s.whatsappDisplay, { ph: "+94 72 212 4765" })}${field("Footer text", "settings.footerText", s.footerText)}</div>
    ${field("Home page intro text", "settings.heroText", s.heroText, { area: true, rows: 2 })}
    ${field("Banner line under the stats", "settings.bannerText", s.bannerText)}
    ${field("Scrolling ticker lines (one per line). Leave empty to build it automatically from your plans.", "settings.tickerLines", s.tickerLines, { area: true, lines: true, rows: 4 })}</div>
  <div class="card"><div class="cardhead"><h3>“Buy safely” boxes</h3><button class="btn line sm" data-act="addSafe">＋ Add box</button></div>
    ${D.safety.map((x, i) => `<div class="grid2">${field("Title", `safety.${i}.title`, x.title)}${field("Icon (emoji)", `safety.${i}.icon`, x.icon)}</div>${field("Text", `safety.${i}.text`, x.text)}
      <button class="btn danger sm" data-act="delSafe" data-i="${i}">Delete box</button><hr style="border:0;border-top:1px dashed var(--line);margin:14px 0">`).join("")}</div>
  <div class="card"><div class="cardhead"><h3>FAQ</h3><button class="btn line sm" data-act="addFaq">＋ Add question</button></div>
    ${D.faq.map((x, i) => `${field("Question", `faq.${i}.q`, x.q)}${field("Answer", `faq.${i}.a`, x.a, { area: true, rows: 2 })}
      <button class="btn danger sm" data-act="delFaq" data-i="${i}">Delete question</button><hr style="border:0;border-top:1px dashed var(--line);margin:14px 0">`).join("")}</div>`;
}

/* ---- Backup ---- */
function backupHtml() {
  return `<div class="card"><h3>Backup &amp; restore</h3>
    <p class="help">Every time you press Save, the server also keeps the previous version. Download a copy to your device now and then, just in case.</p>
    <div class="tools"><button class="btn sm" data-act="download">Download backup (.json)</button>
    <label class="btn line sm" style="cursor:pointer">Restore from file<input type="file" accept="application/json" id="importFile" hidden></label>
    <button class="btn danger sm" data-act="resetSeed">Reset to starter data</button></div>
    <p class="help">Restoring or resetting only loads the data here. Press <b>Save changes</b> to publish it.</p></div>
  <div class="card"><h3>Change the admin password</h3>
    <p class="help">In Netlify open Site configuration → Environment variables → edit <b>ADMIN_PASSWORD</b>, then trigger a new deploy.</p></div>`;
}

/* ---------- image upload (resized in the browser first) ---------- */
function fileToDataUrl(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); resolve(cv.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

/* ---------- events ---------- */
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "idSearch") { idv.q = el.value.replace(/\D/g, ""); idv.page = 0; drawIdRows(); return; }
  if (el.id === "idFilter") { idv.f = el.value; idv.page = 0; drawIdRows(); return; }
  if (el.dataset && el.dataset.bind) { setPath(el.dataset.bind, readEl(el)); markDirty(); }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.sel !== undefined) { el.checked ? idv.sel.add(el.dataset.sel) : idv.sel.delete(el.dataset.sel); $("selCount").textContent = idv.sel.size ? idv.sel.size + " selected" : ""; return; }
  if (el.dataset && el.dataset.act === "selPage") {
    const list = filteredIdx().slice(idv.page * PAGE, idv.page * PAGE + PAGE);
    list.forEach((i) => (el.checked ? idv.sel.add(D.ids[i].id) : idv.sel.delete(D.ids[i].id))); drawIdRows(); return;
  }
  if (el.dataset && el.dataset.productUpload !== undefined && el.files[0]) {
    const [ci, ii] = el.dataset.productUpload.split(",").map(Number); note("Uploading product photo…");
    try {
      const dataUrl = await fileToDataUrl(el.files[0]);
      const r = await api("/api/upload", { method: "POST", body: JSON.stringify({ dataUrl }) });
      D.categories[ci].items[ii].image = r.url; markDirty(); renderTab(); note("Photo uploaded. Press Save changes.");
    } catch (err) { note(err.message); }
    return;
  }
  if (el.dataset && el.dataset.upload !== undefined && el.files[0]) {
    const i = +el.dataset.upload; note("Uploading image…");
    try {
      const dataUrl = await fileToDataUrl(el.files[0]);
      const r = await api("/api/upload", { method: "POST", body: JSON.stringify({ dataUrl }) });
      D.ads[i].image = r.url; markDirty(); renderTab(); note("Image uploaded. Press Save changes.");
    } catch (err) { note(err.message); }
    return;
  }
  if (el.id === "importFile" && el.files[0]) {
    try { D = normalize(JSON.parse(await el.files[0].text())); idv.sel.clear(); markDirty(); renderTab(); note("Backup loaded. Press Save changes to publish."); }
    catch { note("That file is not a valid backup"); }
  }
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "INPUT") return;
  const a = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j;
  const re = () => { markDirty(); renderTab(); };
  switch (a) {
    case "addCat": D.categories.push({ id: uid("cat-"), icon: "🛒", title: "New category", desc: "", ask: "", note: "", hot: false, visible: true, items: [{ id: uid("p"), name: "New plan", price: null, features: [], visible: true }] }); return re();
    case "delCat": if (confirm("Delete this whole category and its plans?")) { D.categories.splice(i, 1); re(); } return;
    case "catUp": move(D.categories, i, -1); return re();
    case "catDown": move(D.categories, i, 1); return re();
    case "addItem": D.categories[i].items.push({ id: uid("p"), name: "New plan", price: null, features: [], visible: true }); return re();
    case "delItem": D.categories[i].items.splice(j, 1); return re();
    case "removeProductImage": D.categories[i].items[j].image = ""; return re();

    case "addIds": {
      const price = $("newPrice").value.trim() === "" ? null : Math.max(0, Math.round(Number($("newPrice").value)) || 0);
      const have = new Set(D.ids.map((x) => x.id)), add = [];
      let skipped = 0;
      for (const raw of $("newIds").value.split(/[\s,;]+/)) {
        const id = raw.replace(/\D/g, "");
        if (id.length < 4) continue;
        if (have.has(id)) { skipped++; continue; }
        have.add(id); add.push({ id, price, sold: false });
      }
      D.ids.unshift(...add); $("newIds").value = "";
      note(add.length + " added" + (skipped ? ", " + skipped + " already existed" : ""));
      markDirty(); return drawIdRows();
    }
    case "delId": D.ids.splice(i, 1); markDirty(); return drawIdRows();
    case "priceSel": { const p = bulkPrice(); if (p === undefined) return; selIdx().forEach((k) => (D.ids[k].price = p)); note("Price set"); markDirty(); return drawIdRows(); }
    case "priceFiltered": { const p = bulkPrice(); if (p === undefined) return; const l = filteredIdx(); if (confirm(`Set Rs. ${p} on all ${l.length} IDs in this list?`)) { l.forEach((k) => (D.ids[k].price = p)); markDirty(); drawIdRows(); } return; }
    case "clearPrice": { const l = filteredIdx(); if (confirm(`Remove the price from all ${l.length} IDs in this list?`)) { l.forEach((k) => (D.ids[k].price = null)); markDirty(); drawIdRows(); } return; }
    case "selFiltered": filteredIdx().forEach((k) => idv.sel.add(D.ids[k].id)); return drawIdRows();
    case "clearSel": idv.sel.clear(); return drawIdRows();
    case "soldSel": selIdx().forEach((k) => (D.ids[k].sold = true)); markDirty(); return drawIdRows();
    case "unsoldSel": selIdx().forEach((k) => (D.ids[k].sold = false)); markDirty(); return drawIdRows();
    case "delSel": { const n = idv.sel.size; if (n && confirm(`Delete ${n} selected IDs?`)) { D.ids = D.ids.filter((x) => !idv.sel.has(x.id)); idv.sel.clear(); markDirty(); drawIdRows(); } else if (!n) note("Select some IDs first"); return; }
    case "pgPrev": idv.page = Math.max(0, idv.page - 1); return drawIdRows();
    case "pgNext": idv.page++; return drawIdRows();

    case "addAd": D.ads.unshift({ id: uid("ad"), title: "", text: "", image: "", link: "", buttonText: "", placement: "banner", active: true }); return re();
    case "delAd": if (confirm("Delete this ad?")) { D.ads.splice(i, 1); re(); } return;

    case "addPay": D.payments.push({ id: uid("pay"), icon: "💳", name: "New method", fee: 0, rows: [{ label: "", value: "" }] }); return re();
    case "delPay": if (confirm("Delete this payment method?")) { D.payments.splice(i, 1); re(); } return;
    case "addRow": D.payments[i].rows.push({ label: "", value: "" }); return re();
    case "delRow": D.payments[i].rows.splice(j, 1); return re();

    case "addSafe": D.safety.push({ icon: "✅", title: "", text: "" }); return re();
    case "delSafe": D.safety.splice(i, 1); return re();
    case "addFaq": D.faq.push({ q: "", a: "" }); return re();
    case "delFaq": D.faq.splice(i, 1); return re();

    case "freeLikesRefresh": return loadFreeLikes();
    case "customersRefresh": return loadCustomers();
    case "freeLikesDelete": {
      if (!confirm("Permanently delete this Free Likes request?")) return;
      b.disabled = true;
      try {
        await api("/api/free-likes-admin", { method: "POST", body: JSON.stringify({ action: "delete", id: b.dataset.id }) });
        note("Request deleted."); await loadFreeLikes();
      } catch (error) { note(error.message); b.disabled = false; }
      return;
    }
    case "freeLikesSetStatus": {
      b.disabled = true;
      try {
        await api("/api/free-likes-admin", {
          method: "POST",
          body: JSON.stringify({ id: b.dataset.id, status: b.dataset.status })
        });
        note("Request status updated.");
        await loadFreeLikes();
      } catch (error) {
        note(error.message);
        b.disabled = false;
      }
      return;
    }

    case "download": {
      const url = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: "application/json" }));
      const l = document.createElement("a"); l.href = url; l.download = "udith-store-backup-" + new Date().toISOString().slice(0, 10) + ".json"; l.click(); URL.revokeObjectURL(url); return;
    }
    case "resetSeed": if (confirm("Replace everything here with the starter data?")) { D = normalize(await (await fetch("/data/seed.json")).json()); idv.sel.clear(); re(); } return;
  }
});

$("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; renderTab(); window.scrollTo(0, 0); } });
$("loginBtn").onclick = doLogin;
$("pw").onkeydown = (e) => { if (e.key === "Enter") doLogin(); };
$("saveBtn").onclick = save;
$("logoutBtn").onclick = () => { if (dirty && !confirm("You have unsaved changes. Log out anyway?")) return; sessionStorage.removeItem("udithAdminToken"); D = null; dirty = false; showLogin(); };
addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

if (token()) enterApp(); else showLogin();
})();
