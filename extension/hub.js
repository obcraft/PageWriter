/* Pagewright community: browse, try and share setups in a full-screen tab. */
var DEFAULT_SERVER = "https://project--9e9f7a85-4d83-4522-9e31-420744d88dd9.lovable.app";
var $ = function (id) { return document.getElementById(id); };
var params = new URLSearchParams(location.search);
var server = DEFAULT_SERVER;
var sharing = null;

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function bareHost(h) { return String(h || "").replace(/^www\./, ""); }

function stepsList(ops) {
  var ul = el("ul");
  (ops || []).slice(0, 5).forEach(function (op) { ul.appendChild(el("li", null, op.label || op.type)); });
  if ((ops || []).length > 5) ul.appendChild(el("li", null, "+" + (ops.length - 5) + " more"));
  return ul;
}

async function getRules() { return (await chrome.storage.local.get("rules")).rules || []; }

/* ---------- Browse ---------- */
var timer;
async function load() {
  var site = bareHost($("siteFilter").value.trim());
  var q = $("search").value.trim();
  $("browseMsg").textContent = "Loading…";
  try {
    var url = server + "/api/public/configs?" + new URLSearchParams(Object.assign({}, site ? { host: site } : {}, q ? { q: q } : {}));
    var res = await fetch(url);
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't load.");
    var installed = new Set((await getRules()).map(function (r) { return r.sharedId; }).filter(Boolean));
    renderGrid(data.configs || [], installed);
    $("browseMsg").textContent = data.configs.length ? "" : "No shared setups yet" + (site ? " for " + site : "") + ". Be the first — share one from “My setups”.";
  } catch (e) {
    $("grid").innerHTML = "";
    $("browseMsg").textContent = "Couldn't reach the Pagewright server.";
  }
}

function renderGrid(configs, installed) {
  var grid = $("grid");
  grid.innerHTML = "";
  configs.forEach(function (c) {
    var card = el("article", "card");
    card.appendChild(el("span", "site", c.host === "*" ? "all websites" : c.host));
    card.appendChild(el("h3", null, c.title));
    if (c.description) card.appendChild(el("p", "desc", c.description));
    card.appendChild(stepsList(c.operations));
    card.appendChild(el("div", "meta", "by " + c.author_name + " · " + c.installs + " tried"));
    var row = el("div", "row");
    var btn = el("button", "btn primary", installed.has(c.id) ? "Added ✓" : "Try it");
    btn.disabled = installed.has(c.id);
    btn.addEventListener("click", function () { tryConfig(c, btn); });
    row.appendChild(btn);
    if (c.host !== "*") {
      var open = el("button", "btn", "Open site");
      open.addEventListener("click", function () { chrome.tabs.create({ url: "https://" + c.host }); });
      row.appendChild(open);
    }
    card.appendChild(row);
    grid.appendChild(card);
  });
}

async function tryConfig(c, btn) {
  var rules = await getRules();
  rules.push({
    id: Math.random().toString(36).slice(2, 10),
    sharedId: c.id,
    host: c.host,
    path: "/",
    instruction: c.title,
    summary: c.description || c.instruction,
    operations: c.operations,
    enabled: true,
    createdAt: Date.now(),
  });
  await chrome.storage.local.set({ rules: rules });
  btn.textContent = "Added ✓";
  btn.disabled = true;
  fetch(server + "/api/public/configs/" + c.id + "/install", { method: "POST" }).catch(function () {});
  // Applies automatically to open and future tabs of that site.
}

/* ---------- My setups ---------- */
async function renderMine() {
  var rules = await getRules();
  var grid = $("mineGrid");
  grid.innerHTML = "";
  if (!rules.length) grid.appendChild(el("p", "hint", "Nothing kept yet. Change a page with the side panel first."));
  rules.forEach(function (r) {
    var card = el("article", "card");
    card.appendChild(el("span", "site", r.host === "*" ? "all websites" : bareHost(r.host)));
    card.appendChild(el("h3", null, r.instruction));
    if (r.summary) card.appendChild(el("p", "desc", r.summary));
    card.appendChild(stepsList(r.operations));
    var row = el("div", "row");
    var share = el("button", "btn primary", r.sharedId ? "Shared ✓" : "Share");
    share.disabled = !!r.sharedId;
    share.addEventListener("click", function () { openShare(r); });
    var del = el("button", "btn", "Remove");
    del.addEventListener("click", async function () {
      var next = (await getRules()).filter(function (x) { return x.id !== r.id; });
      await chrome.storage.local.set({ rules: next });
      renderMine();
    });
    row.appendChild(share);
    row.appendChild(del);
    card.appendChild(row);
    grid.appendChild(card);
  });
}

function openShare(rule) {
  sharing = rule;
  $("shareWhat").textContent = (rule.host === "*" ? "All websites" : bareHost(rule.host)) + " · " + rule.operations.length + " step(s)";
  $("shTitle").value = rule.instruction.slice(0, 80);
  $("shDesc").value = "";
  $("shareErr").hidden = true;
  chrome.storage.local.get("authorName").then(function (r) { $("shName").value = r.authorName || ""; });
  $("shareDlg").showModal();
}

$("shareForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!sharing) return;
  $("shareSubmit").disabled = true;
  try {
    var name = $("shName").value.trim();
    chrome.storage.local.set({ authorName: name });
    var res = await fetch(server + "/api/public/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: sharing.host === "*" ? "*" : bareHost(sharing.host),
        title: $("shTitle").value,
        description: $("shDesc").value,
        authorName: name,
        instruction: sharing.instruction,
        operations: sharing.operations,
      }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Couldn't share.");
    var rules = await getRules();
    var r = rules.find(function (x) { return x.id === sharing.id; });
    if (r) r.sharedId = data.id;
    await chrome.storage.local.set({ rules: rules });
    $("shareDlg").close();
    renderMine();
    load();
  } catch (err) {
    $("shareErr").textContent = String(err.message || err);
    $("shareErr").hidden = false;
  } finally {
    $("shareSubmit").disabled = false;
  }
});
$("shareCancel").addEventListener("click", function () { $("shareDlg").close(); });

/* ---------- Tabs & init ---------- */
function show(tab) {
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === tab); });
  $("browse").hidden = tab !== "browse";
  $("mine").hidden = tab !== "mine";
  if (tab === "mine") renderMine(); else load();
}
document.querySelectorAll(".tab").forEach(function (t) { t.addEventListener("click", function () { show(t.dataset.tab); }); });
document.querySelectorAll(".quick .chip").forEach(function (c) {
  c.addEventListener("click", function () { $("siteFilter").value = c.dataset.site; load(); });
});
["siteFilter", "search"].forEach(function (id) {
  $(id).addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 300); });
});

(async function init() {
  var s = await chrome.storage.local.get("serverUrl");
  server = (s.serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
  var host = params.get("host");
  if (host && !/^(newtab|extensions)$/.test(host)) $("siteFilter").value = bareHost(host);
  var shareId = params.get("share");
  if (shareId) {
    show("mine");
    var rule = (await getRules()).find(function (r) { return r.id === shareId; });
    if (rule) openShare(rule);
  } else {
    show("browse");
  }
})();
