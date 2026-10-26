var DEFAULT_SERVER = "https://project--9e9f7a85-4d83-4522-9e31-420744d88dd9.lovable.app";
var $ = function (id) { return document.getElementById(id); };
var tab = null;
var activeKey = null;
var refreshVersion = 0;
var drafts = {};
var currentState = null;

var STATUS_TEXT = {
  reading: "Reading the page…",
  thinking: "Figuring out the change…",
  applying: "Applying…",
};

function render(state) {
  currentState = state;
  var t = state && state.target;
  $("target").hidden = !t;
  if (t) $("targetText").textContent = "This: " + t.label;
  $("pick").textContent = state && state.picking ? "Click it on the page… (Esc)" : t ? "⌖ Pick another" : "⌖ Pick element";
  $("instruction").placeholder = t ? "e.g. make this bigger · move this to the bottom · hide these" : "What would you like to change?";
  var busy = state && STATUS_TEXT[state.status];
  $("run").disabled = !!busy || !tab;
  $("pick").disabled = !!busy || !!(state && state.picking) || !tab;
  $("undo").hidden = !done;
  $("status").hidden = !busy;
  if (busy) $("statusText").textContent = STATUS_TEXT[state.status];

  $("error").hidden = !(state && state.status === "error");
  if (state && state.status === "error") $("error").textContent = state.error;

  var done = state && state.status === "done";
  var live = state && (state.status === "applying" || done) && state.operations;
  $("result").hidden = !live;
  if (live) {
    $("summary").textContent = state.summary || "Done.";
    var ops = $("ops");
    ops.innerHTML = "";
    (state.results || []).forEach(function (r) {
      var li = document.createElement("li");
      li.className = r.ok && r.affected > 0 ? "ok" : "bad";
      var name = r.label || r.type;
      li.textContent = r.ok && r.affected > 0
        ? "✓ " + name
        : "✗ " + name + (r.ok ? " (nothing matched)" : " (couldn't apply)");
      ops.appendChild(li);
    });
    if (state.status === "applying") {
      var li2 = document.createElement("li");
      li2.textContent = "… " + ((state.operations[(state.results || []).length] || {}).label || "Working");
      ops.appendChild(li2);
    }
    var canKeep = done && (state.operations || []).length > 0;
    $("keep").hidden = !canKeep;
    $("keepAll").hidden = !canKeep;
    $("keep").disabled = !!state.saved;
    $("keepAll").disabled = state.saved === "all";
    $("keep").textContent = state.saved ? "Saved for this site ✓" : "Keep on this site";
    $("keepAll").textContent = state.saved === "all" ? "Kept everywhere ✓" : "Keep on all sites";
  }
}

function renderSaved(rules) {
  if (!tab) return;
  var host;
  try { host = new URL(tab.url).hostname; } catch (e) { return; }
  var mine = (rules || []).filter(function (r) { return r.host === "*" || r.host.replace(/^www\./, "") === host.replace(/^www\./, ""); });
  $("savedWrap").hidden = mine.length === 0;
  var ul = $("saved");
  ul.innerHTML = "";
  mine.forEach(function (rule) {
    var li = document.createElement("li");
    var span = document.createElement("span");
    span.textContent = (rule.host === "*" ? "[all sites] " : "") + rule.instruction;
    span.title = rule.summary || "";
    var share = document.createElement("button");
    share.textContent = "↗";
    share.title = "Share setup";
    share.setAttribute("aria-label", "Share setup");
    share.addEventListener("click", function () {
      chrome.tabs.create({ url: chrome.runtime.getURL("hub.html?share=" + rule.id) });
    });
    var del = document.createElement("button");
    del.textContent = "×";
    del.title = "Remove setup";
    del.setAttribute("aria-label", "Remove setup");
    del.addEventListener("click", function () {
      var next = rules.filter(function (r) { return r.id !== rule.id; });
      chrome.storage.local.set({ rules: next });
    });
    li.appendChild(span);
    li.appendChild(share);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function run() {
  var instruction = $("instruction").value.trim();
  if (!instruction || !tab || $("run").disabled) return;
  render(Object.assign({}, currentState, { status: "reading" }));
  chrome.runtime.sendMessage({ type: "run", tabId: tab.id, instruction: instruction }).catch(function () {
    render({ status: "error", error: "Couldn’t start the change. Please try again." });
  });
}

async function refreshTab() {
  var version = ++refreshVersion;
  if (tab) drafts[tab.id] = $("instruction").value;
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (version !== refreshVersion) return;
  var next = tabs[0];
  if (!next) { tab = null; activeKey = null; render(null); return; }
  var changed = !tab || tab.id !== next.id;
  tab = next;
  activeKey = "last:" + tab.id;
  try { $("host").textContent = new URL(tab.url).hostname || "this page"; } catch (e) { $("host").textContent = "this page"; }
  if (changed) { render(null); $("instruction").value = drafts[tab.id] || ""; }
  var session = await chrome.storage.session.get(activeKey);
  var local = await chrome.storage.local.get(["rules", "serverUrl"]);
  if (version !== refreshVersion) return;
  var last = session[activeKey];
  if (changed && !Object.prototype.hasOwnProperty.call(drafts, tab.id) && last && last.instruction) $("instruction").value = last.instruction;
  render(last || null);
  renderSaved(local.rules);
  if (document.activeElement !== $("serverUrl")) $("serverUrl").value = local.serverUrl || DEFAULT_SERVER;
}

async function init() {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "session" && activeKey && changes[activeKey]) render(changes[activeKey].newValue);
    if (area === "local" && changes.rules) renderSaved(changes.rules.newValue);
  });
  $("run").addEventListener("click", run);
  $("hubBtn").addEventListener("click", function () {
    var h = ""; try { h = new URL(tab.url).hostname; } catch (e) {}
    chrome.tabs.create({ url: chrome.runtime.getURL("hub.html?host=" + encodeURIComponent(h)) });
  });
  $("pick").addEventListener("click", function () { chrome.runtime.sendMessage({ type: "pick", tabId: tab.id }); });
  $("clearTarget").addEventListener("click", function () { chrome.runtime.sendMessage({ type: "clearTarget", tabId: tab.id }); });
  $("instruction").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
  });
  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      $("instruction").value = chip.dataset.instruction || chip.textContent;
      $("instruction").focus();
    });
  });
  $("keep").addEventListener("click", function () {
    chrome.runtime.sendMessage({ type: "save", tabId: tab.id });
  });
  $("keepAll").addEventListener("click", function () {
    chrome.runtime.sendMessage({ type: "save", tabId: tab.id, everywhere: true });
  });
  $("undo").addEventListener("click", function () {
    chrome.runtime.sendMessage({ type: "undo", tabId: tab.id });
  });
  $("settingsBtn").addEventListener("click", function () {
    $("settings").hidden = !$("settings").hidden;
  });
  $("saveSettings").addEventListener("click", function () {
    var v = $("serverUrl").value.trim().replace(/\/+$/, "");
    chrome.storage.local.set({ serverUrl: v || DEFAULT_SERVER }).then(function () {
      $("settingsMsg").textContent = "Saved";
      setTimeout(function () { $("settingsMsg").textContent = ""; }, 1500);
    });
  });
  await refreshTab();
  $("instruction").focus();
}

init();

// Side panel stays open across tabs: refresh when the active tab or its page changes.
chrome.tabs.onActivated.addListener(function () { refreshTab(); });
chrome.tabs.onUpdated.addListener(function (id, info) {
  if (tab && id === tab.id && info.status === "complete") refreshTab();
});
