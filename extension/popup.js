var DEFAULT_SERVER = globalThis.PagewrightConfig.serverUrl;
var $ = function (id) { return document.getElementById(id); };
var tab = null;
var activeKey = null;
var refreshVersion = 0;
var drafts = {};
var currentState = null;
var aiReady = false;
var savedAI = null;
var aiAccount = null;
var configuredProviders = [];
var aiSettingsVersion = 0;
var AI_MODELS = {
  openrouter: [
    { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5" },
    { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
    { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5" },
    { id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "openai/gpt-4.1", label: "GPT-4.1" }
  ],
  anthropic: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" }
  ],
  openai: [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4o-mini", label: "GPT-4o mini" }
  ]
};

function modelOptions(provider, selected) {
  var models = (AI_MODELS[provider] || []).slice();
  if (selected && savedAI && savedAI.provider === provider && !models.some(function (m) { return m.id === selected; })) {
    models.push({ id: selected, label: "Previously saved: " + selected });
  }
  var select = $("aiModel");
  select.replaceChildren();
  if (!models.length) {
    var placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "Choose a provider first";
    select.appendChild(placeholder);
  }
  models.forEach(function (model) {
    var option = document.createElement("option");
    option.value = model.id; option.textContent = model.label;
    select.appendChild(option);
  });
  select.disabled = !models.length;
  select.value = models.some(function (m) { return m.id === selected; }) ? selected : models.length ? models[0].id : "";
  var hasKey = configuredProviders.includes(provider);
  $("apiKey").required = !hasKey;
  $("apiKey").placeholder = hasKey ? "Saved encrypted — leave blank to keep" : "Paste your provider API key";
  $("apiKey").disabled = !aiAccount;
  $("removeKey").hidden = !hasKey;
}

function applyAISettings(state) {
  savedAI = state && state.settings || null;
  aiAccount = state && state.user || null;
  configuredProviders = (state && state.credentials || []).map(function (c) { return c.provider; });
  aiReady = !!(aiAccount && savedAI && savedAI.userId === aiAccount.id && AI_MODELS[savedAI.provider] && configuredProviders.includes(savedAI.provider) && savedAI.model);
  $("settingsTitle").textContent = !aiAccount ? "Sign in to get started" : aiReady ? "AI settings" : "Bring your own AI";
  $("settingsIntro").textContent = aiAccount
    ? "Choose a provider and add your API key. AI usage is billed to your own provider account."
    : "First sign in or create an account. Then choose your AI provider and save your API key securely to your account.";
  $("accountStatus").textContent = aiAccount
    ? "Signed in as @" + aiAccount.username + (configuredProviders.length ? ". Encrypted API keys saved: " + configuredProviders.length + "." : ". No API key has been saved to this account yet.")
    : "Sign in to save your API key securely on your account.";
  $("signInForAI").hidden = !!aiAccount;
  $("settingsForm").hidden = !aiAccount;
  $("saveSettings").disabled = !aiAccount;
  $("apiKey").disabled = !aiAccount;
  if (!aiReady) $("settings").hidden = false;
  render(currentState);
}

async function loadAISettings() {
  var version = ++aiSettingsVersion;
  var response = await chrome.runtime.sendMessage({ type: "getAISettings" });
  if (version !== aiSettingsVersion) return;
  if (!response || response.error) {
    applyAISettings(null);
    $("settingsMsg").textContent = response && response.error || "Couldn't load encrypted key settings.";
    return;
  }
  applyAISettings(response);
}

function fillAISettings() {
  $("aiProvider").value = savedAI && savedAI.provider || "";
  $("apiKey").value = "";
  modelOptions($("aiProvider").value, savedAI && savedAI.model);
}

function openAISettings() {
  fillAISettings();
  if (currentState && currentState.requiresSetup) $("settingsMsg").textContent = currentState.error || "Update your API key to continue.";
  $("settings").hidden = false;
  render(currentState);
  (aiAccount ? $("aiProvider") : $("signInForAI")).focus();
}

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
  var done = state && state.status === "done";
  $("editor").hidden = !aiReady || !$("settings").hidden;
  $("run").disabled = !!busy || !tab || !aiReady;
  $("pick").disabled = !!busy || !!(state && state.picking) || !tab;
  $("undo").hidden = !done;
  $("status").hidden = !busy;
  if (busy) $("statusText").textContent = STATUS_TEXT[state.status];

  $("error").hidden = !(state && state.status === "error");
  if (state && state.status === "error") $("error").textContent = state.error;

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
  if (!aiReady) { openAISettings(); return; }
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
  var local = await chrome.storage.local.get("rules");
  if (version !== refreshVersion) return;
  var last = session[activeKey];
  if (changed && !Object.prototype.hasOwnProperty.call(drafts, tab.id) && last && last.instruction) $("instruction").value = last.instruction;
  render(last || null);
  renderSaved(local.rules);

}

async function init() {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "session" && activeKey && changes[activeKey]) {
      render(changes[activeKey].newValue);
      if (changes[activeKey].newValue && changes[activeKey].newValue.requiresSetup) openAISettings();
    }
    if (area === "local" && changes.rules) renderSaved(changes.rules.newValue);
    if (area === "local" && (changes.aiSettings || changes.account)) {
      var oldUser = aiAccount && aiAccount.id;
      loadAISettings().then(function () {
        if (oldUser !== (aiAccount && aiAccount.id) || !$("settings").hidden && !$("apiKey").value) fillAISettings();
      }).catch(function () { $("settingsMsg").textContent = "Couldn't load encrypted key settings."; });
    }
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
    if ($("settings").hidden) openAISettings();
    else if (aiReady) { $("settings").hidden = true; render(currentState); }
  });
  $("aiProvider").addEventListener("change", function () {
    $("apiKey").value = "";
    modelOptions($("aiProvider").value, savedAI && savedAI.provider === $("aiProvider").value ? savedAI.model : null);
  });
  $("signInForAI").addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("hub.html?auth=1") });
  });
  $("settingsForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!aiAccount) { $("settingsMsg").textContent = "Sign in before saving your encrypted API key."; return; }
    var provider = $("aiProvider").value;
    var model = $("aiModel").value;
    if (!AI_MODELS[provider] || !model) { $("settingsMsg").textContent = "Choose a provider and model."; return; }
    $("saveSettings").disabled = true;
    try {
      var response = await chrome.runtime.sendMessage({
        type: "saveAISettings", provider: provider, model: model,
        apiKey: $("apiKey").value.trim()
      });
      if (!response || response.error) throw new Error(response && response.error || "Couldn't save encrypted API key.");
      $("apiKey").value = "";
      await loadAISettings();
      fillAISettings();
      $("settingsMsg").textContent = "Saved encrypted to your account.";
      $("settings").hidden = aiReady;
      render(currentState);
      if (aiReady) $("instruction").focus();
    } catch (error) { $("settingsMsg").textContent = error.message || "Couldn't save your key."; }
    finally { $("saveSettings").disabled = !aiAccount; }
  });
  $("removeKey").addEventListener("click", async function () {
    try {
      var response = await chrome.runtime.sendMessage({ type: "removeAIKey", provider: $("aiProvider").value });
      if (!response || response.error) throw new Error(response && response.error || "Couldn't remove key.");
      await loadAISettings();
      openAISettings();
      $("settingsMsg").textContent = "Key removed from your account.";
    } catch (error) { $("settingsMsg").textContent = error.message; }
  });
  $("serverStatus").textContent = "Server: " + DEFAULT_SERVER;
  await loadAISettings();
  fillAISettings();
  await refreshTab();
  (aiReady ? $("instruction") : aiAccount ? $("aiProvider") : $("signInForAI")).focus();
}

var initialized = init().catch(function () {
  applyAISettings(null);
  $("settingsMsg").textContent = "Couldn't load settings. Close and reopen Pagewright to try again.";
});

// Side panel stays open across tabs: refresh when the active tab or its page changes.
chrome.tabs.onActivated.addListener(function () { refreshTab(); });
chrome.tabs.onUpdated.addListener(function (id, info) {
  if (tab && id === tab.id && info.status === "complete") refreshTab();
});
