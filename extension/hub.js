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
var currentTab = "popular";
var view = "grid";
var lastConfigs = [];
var loadVersion = 0;
var drawVersion = 0;
var loadController = null;

async function load() {
  var version = ++loadVersion;
  if (loadController) loadController.abort();
  var controller = new AbortController();
  loadController = controller;
  $("grid").setAttribute("aria-busy", "true");
  var popular = currentTab === "popular";
  var site = bareHost($("siteFilter").value.trim());
  var q = $("search").value.trim();
  var sort = popular ? "popular" : $("sort").value;
  $("sortWrap").hidden = popular;
  $("browseTitle").textContent = popular ? "Most liked setups" + (site ? " for " + site : "") : "Browse all setups";
  $("browseMsg").textContent = "Loading…";
  document.querySelectorAll(".quick .chip").forEach(function (b) { b.classList.toggle("active", b.dataset.site === site); });
  try {
    var p = { sort: sort, limit: popular ? "30" : "100" };
    if (site) p.host = site;
    if (q) p.q = q;
    var token = await accessToken().catch(function () { return null; });
    if (version !== loadVersion) return;
    var res = await fetch(server + "/api/public/configs?" + new URLSearchParams(p), {
      signal: controller.signal,
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    var data = await res.json();
    if (version !== loadVersion) return;
    if (!res.ok) throw new Error(data.error || "Couldn't load.");
    lastConfigs = data.configs || [];
    var sites = {};
    lastConfigs.forEach(function (c) { if (c.host !== "*") sites[c.host] = 1; });
    $("siteList").innerHTML = "";
    Object.keys(sites).sort().forEach(function (h) { var o = el("option"); o.value = h; $("siteList").appendChild(o); });
    await draw();
  } catch (e) {
    if (version !== loadVersion || e.name === "AbortError") return;
    $("browseMsg").textContent = "Couldn’t load setups. Change a filter to try again.";
  } finally {
    if (version === loadVersion) $("grid").setAttribute("aria-busy", "false");
  }
}

async function draw() {
  var version = ++drawVersion;
  var list = lastConfigs;
  if ($("likedOnly").checked) list = list.filter(function (c) { return c.liked; });
  var installed = new Set((await getRules()).map(function (r) { return r.sharedId; }).filter(Boolean));
  if (version !== drawVersion) return;
  renderGrid(list, installed);
  var site = bareHost($("siteFilter").value.trim());
  $("browseMsg").textContent = list.length
    ? list.length + " setup" + (list.length === 1 ? "" : "s")
    : $("likedOnly").checked ? "You haven't liked anything here yet." : "No shared setups yet" + (site ? " for " + site : "") + ". Be the first — share one from “My setups”.";
}

function setView(v) {
  view = v;
  chrome.storage.local.set({ hubView: v });
  document.querySelectorAll(".seg button").forEach(function (b) { b.classList.toggle("active", b.dataset.view === v); b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
  $("grid").className = "grid " + (v === "grid" ? "" : v);
}

function likeButton(c) {
  var b = el("button", "like" + (c.liked ? " on" : ""), (c.liked ? "♥ " : "♡ ") + (c.likes || 0));
  b.title = c.liked ? "Unlike" : "Like";
  b.setAttribute("aria-label", b.title + " " + c.title);
  b.setAttribute("aria-pressed", String(!!c.liked));
  b.addEventListener("click", async function () {
    var token = await accessToken();
    if (!token) return openAuth(false);
    b.disabled = true;
    try {
      var res = await fetch(server + "/api/public/configs/" + c.id + "/like", {
        method: "POST", headers: { Authorization: "Bearer " + token },
      });
      var d = await res.json();
      if (!res.ok) throw new Error(d.error);
      c.liked = d.liked; c.likes = d.likes;
      b.className = "like" + (c.liked ? " on" : "");
      b.textContent = (c.liked ? "♥ " : "♡ ") + c.likes;
      b.title = c.liked ? "Unlike" : "Like";
      b.setAttribute("aria-label", b.title + " " + c.title);
      b.setAttribute("aria-pressed", String(!!c.liked));
      if ($("likedOnly").checked) draw();
    } catch (e) { $("browseMsg").textContent = "Couldn’t save your like. Please try again."; } finally { b.disabled = false; }
  });
  return b;
}

function renderGrid(configs, installed) {
  var grid = $("grid");
  var focused = document.activeElement;
  var focusCard = focused && focused.closest("[data-config-id]");
  var focusId = focusCard && focusCard.dataset.configId;
  var focusIndex = focusCard ? Array.from(focusCard.querySelectorAll("button")).indexOf(focused) : -1;
  grid.innerHTML = "";
  var fragment = document.createDocumentFragment();
  configs.forEach(function (c, i) {
    var card = el("article", "card");
    card.dataset.configId = c.id;
    var body = el("div", "body");
    var top = el("div", "top");
    var left = el("div");
    left.appendChild(el("span", "site", c.host === "*" ? "all websites" : c.host));
    left.appendChild(el("h3", null, c.title));
    top.appendChild(left);
    if (currentTab === "popular" && view === "grid") top.appendChild(el("span", "rank", "#" + (i + 1)));
    body.appendChild(top);
    if (c.description) body.appendChild(el("p", "desc", c.description));
    body.appendChild(stepsList(c.operations));
    body.appendChild(el("div", "meta", "by @" + c.author_name + " · " + c.installs + " tried · " + new Date(c.created_at).toLocaleDateString()));
    card.appendChild(body);
    var row = el("div", "row");
    row.appendChild(likeButton(c));
    var btn = el("button", "btn primary", installed.has(c.id) ? "Added ✓" : "Try it");
    btn.disabled = installed.has(c.id);
    btn.addEventListener("click", function () { tryConfig(c, btn); });
    row.appendChild(btn);
    if (c.host !== "*" && view !== "compact") {
      var open = el("button", "btn", "Open site");
      open.addEventListener("click", function () { chrome.tabs.create({ url: "https://" + c.host }); });
      row.appendChild(open);
    }
    card.appendChild(row);
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
  if (focusId && focusIndex >= 0) {
    var replacement = Array.from(grid.children).find(function (card) { return card.dataset.configId === focusId; });
    var button = replacement && replacement.querySelectorAll("button")[focusIndex];
    if (button) button.focus({ preventScroll: true });
  }
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

async function openShare(rule) {
  var acc = await getAccount();
  if (!acc) { pendingShare = rule; return openAuth(false); }
  sharing = rule;
  $("shareAs").textContent = "Shared as @" + acc.username;
  $("shareWhat").textContent = (rule.host === "*" ? "All websites" : bareHost(rule.host)) + " · " + rule.operations.length + " step(s)";
  $("shTitle").value = rule.instruction.slice(0, 80);
  $("shDesc").value = "";
  $("shareErr").hidden = true;
  $("shareDlg").showModal();
}

$("shareForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!sharing) return;
  $("shareSubmit").disabled = true;
  try {
    var token = await accessToken();
    if (!token) { $("shareDlg").close(); pendingShare = sharing; return openAuth(false); }
    var res = await fetch(server + "/api/public/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        host: sharing.host === "*" ? "*" : bareHost(sharing.host),
        title: $("shTitle").value,
        description: $("shDesc").value,
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

/* ---------- Account ---------- */
var pendingShare = null;
var signupMode = false;

async function getAccount() { return (await chrome.storage.local.get("account")).account || null; }

async function saveSession(d) {
  var acc = { accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt: d.expiresAt, username: d.username };
  await chrome.storage.local.set({ account: acc });
  renderAccount();
  return acc;
}

// Returns a valid access token, refreshing it when it is about to expire.
async function accessToken() {
  var acc = await getAccount();
  if (!acc) return null;
  if (acc.expiresAt && acc.expiresAt * 1000 - Date.now() > 60000) return acc.accessToken;
  var res = await fetch(server + "/api/public/auth/refresh", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: acc.refreshToken }),
  });
  if (!res.ok) { await chrome.storage.local.remove("account"); renderAccount(); return null; }
  return (await saveSession(await res.json())).accessToken;
}

async function renderAccount() {

  var acc = await getAccount();
  $("whoami").hidden = !acc;
  $("whoami").textContent = acc ? "@" + acc.username : "";
  $("signInBtn").hidden = !!acc;
  $("signOutBtn").hidden = !acc;
}

function setMode(signup) {
  signupMode = signup;
  $("authTitle").textContent = signup ? "Create an account" : "Sign in";
  $("authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("authSwitch").textContent = signup ? "Have an account? Sign in" : "New here? Create an account";
  $("usernameWrap").hidden = !signup;
  $("auUser").required = signup;
  $("auPass").autocomplete = signup ? "new-password" : "current-password";
  $("authErr").hidden = true;
  $("authOk").hidden = true;
}

function openAuth(signup) { setMode(!!signup); $("authDlg").showModal(); }

$("signInBtn").addEventListener("click", function () { openAuth(false); });
$("signOutBtn").addEventListener("click", async function () { await chrome.storage.local.remove("account"); await renderAccount(); if (!$("browse").hidden) load(); });
$("authCancel").addEventListener("click", function () { pendingShare = null; $("authDlg").close(); });
$("authSwitch").addEventListener("click", function (e) { e.preventDefault(); setMode(!signupMode); });

$("authForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  $("authSubmit").disabled = true;
  $("authErr").hidden = true;
  try {
    var payload = { email: $("auEmail").value, password: $("auPass").value };
    if (signupMode) payload.username = $("auUser").value.trim().toLowerCase();
    var res = await fetch(server + "/api/public/auth/" + (signupMode ? "signup" : "login"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    if (data.needsConfirmation) {
      setMode(false);
      $("authOk").textContent = "Check your email to confirm your account, then sign in here.";
      $("authOk").hidden = false;
      return;
    }
    await saveSession(data);
    $("authDlg").close();
    if (!$("browse").hidden) load();
    if (pendingShare) { var r = pendingShare; pendingShare = null; openShare(r); }
  } catch (err) {
    $("authErr").textContent = String(err.message || err);
    $("authErr").hidden = false;
  } finally {
    $("authSubmit").disabled = false;
  }
});

/* ---------- Tabs & init ---------- */
function show(tab) {
  currentTab = tab;
  clearTimeout(timer);
  if (tab === "mine") { ++loadVersion; ++drawVersion; if (loadController) loadController.abort(); $("grid").setAttribute("aria-busy", "false"); }
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === tab); });
  $("browse").hidden = tab === "mine";
  $("mine").hidden = tab !== "mine";
  if (tab === "mine") renderMine(); else load();
}
document.querySelectorAll(".tab").forEach(function (t) { t.addEventListener("click", function () { show(t.dataset.tab); }); });
document.querySelectorAll(".quick .chip").forEach(function (c) {
  c.addEventListener("click", function () { $("siteFilter").value = c.dataset.site; load(); });
});
$("sort").addEventListener("change", load);
$("likedOnly").addEventListener("change", draw);
document.querySelectorAll(".seg button").forEach(function (b) {
  b.addEventListener("click", function () { setView(b.dataset.view); draw(); });
});
["siteFilter", "search"].forEach(function (id) {
  $(id).addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 300); });
});

(async function init() {
  var s = await chrome.storage.local.get("serverUrl");
  server = (s.serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
  renderAccount();
  setView((await chrome.storage.local.get("hubView")).hubView || "grid");
  var host = params.get("host");
  if (host && !/^(newtab|extensions)$/.test(host)) $("siteFilter").value = bareHost(host);
  var shareId = params.get("share");
  if (shareId) {
    show("mine");
    var rule = (await getRules()).find(function (r) { return r.id === shareId; });
    if (rule) openShare(rule);
  } else {
    show("popular");
  }
})();
