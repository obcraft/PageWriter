var DEFAULT_SERVER = "https://project--113b80e6-3c46-4339-b113-b0987ed33340.lovable.app";
var $ = function (id) { return document.getElementById(id); };
var tab = null;

var STATUS_TEXT = {
  reading: "Reading the page…",
  thinking: "Figuring out the change…",
  applying: "Applying…",
};

function render(state) {
  var busy = state && STATUS_TEXT[state.status];
  $("run").disabled = !!busy;
  $("status").hidden = !busy;
  if (busy) $("statusText").textContent = STATUS_TEXT[state.status];

  $("error").hidden = !(state && state.status === "error");
  if (state && state.status === "error") $("error").textContent = state.error;

  var done = state && state.status === "done";
  $("result").hidden = !done;
  if (done) {
    $("summary").textContent = state.summary || "Done.";
    var ops = $("ops");
    ops.innerHTML = "";
    (state.results || []).forEach(function (r) {
      var li = document.createElement("li");
      li.className = r.ok && r.affected > 0 ? "ok" : "bad";
      li.textContent = r.ok
        ? r.type + " — " + r.affected + " element" + (r.affected === 1 ? "" : "s")
        : r.type + " — " + r.error;
      ops.appendChild(li);
    });
    var canKeep = (state.operations || []).length > 0;
    $("keep").hidden = !canKeep;
    $("keepAll").hidden = !canKeep;
    $("keep").disabled = !!state.saved;
    $("keepAll").disabled = !!state.saved;
    $("keep").textContent = state.saved === "site" || state.saved === true ? "Kept ✓" : "Keep on this site";
    $("keepAll").textContent = state.saved === "all" ? "Kept everywhere ✓" : "Keep on all sites";
  }
}

function renderSaved(rules) {
  if (!tab) return;
  var host;
  try { host = new URL(tab.url).hostname; } catch (e) { return; }
  var mine = (rules || []).filter(function (r) { return r.host === host || r.host === "*"; });
  $("savedWrap").hidden = mine.length === 0;
  var ul = $("saved");
  ul.innerHTML = "";
  mine.forEach(function (rule) {
    var li = document.createElement("li");
    var span = document.createElement("span");
    span.textContent = (rule.host === "*" ? "[all sites] " : "") + rule.instruction;
    span.title = rule.summary || "";
    var del = document.createElement("button");
    del.textContent = "Remove";
    del.addEventListener("click", function () {
      var next = rules.filter(function (r) { return r.id !== rule.id; });
      chrome.storage.local.set({ rules: next });
    });
    li.appendChild(span);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function run() {
  var instruction = $("instruction").value.trim();
  if (!instruction || !tab) return;
  chrome.runtime.sendMessage({ type: "run", tabId: tab.id, instruction: instruction });
}

async function init() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = tabs[0];
  try { $("host").textContent = new URL(tab.url).hostname || "this page"; } catch (e) {}

  var key = "last:" + tab.id;
  var session = await chrome.storage.session.get(key);
  var last = session[key];
  if (last) {
    if (last.instruction) $("instruction").value = last.instruction;
    render(last);
  }

  var local = await chrome.storage.local.get(["rules", "serverUrl"]);
  renderSaved(local.rules);
  $("serverUrl").value = local.serverUrl || DEFAULT_SERVER;

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "session" && changes[key]) render(changes[key].newValue);
    if (area === "local" && changes.rules) renderSaved(changes.rules.newValue);
  });

  $("run").addEventListener("click", run);
  $("instruction").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
  });
  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      $("instruction").value = chip.textContent;
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
    chrome.storage.session.remove(key);
    chrome.tabs.reload(tab.id);
    window.close();
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
  $("instruction").focus();
}

init();
