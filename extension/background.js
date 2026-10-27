importScripts("config.js");
/* Pagewright background: reads the page, asks the AI for a plan, applies it locally. */
var DEFAULT_SERVER = globalThis.PagewrightConfig.serverUrl;
// Keep API keys and account tokens out of content-script storage access.
var storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
var refreshingAccount = null;
var refreshingAccountToken = null;

function serverAddress(value) {
  var url = new URL(value || DEFAULT_SERVER);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)))) {
    throw new Error("Use an HTTPS server address (or localhost for development).");
  }
  return url.href.replace(/\/+$/, "");
}

async function accountToken(server) {
  await storageReady;
  var account = (await chrome.storage.local.get("account")).account;
  if (!account) return null;
  if (account.expiresAt && account.expiresAt * 1000 - Date.now() > 60000) return account.accessToken;
  if (!refreshingAccount || refreshingAccountToken !== account.refreshToken) {
    refreshingAccountToken = account.refreshToken;
    var pending = (async function () {
    var response = await fetch(server + "/api/public/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: account.refreshToken }), redirect: "error",
    });
    var current = (await chrome.storage.local.get("account")).account;
    if (!current || current.refreshToken !== account.refreshToken) return null;
    if (!response.ok) { await chrome.storage.local.remove("account"); return null; }
    var data = await response.json();
    await chrome.storage.local.set({ account: data });
    return data.accessToken;
    })().finally(function () {
      if (refreshingAccount === pending) { refreshingAccount = null; refreshingAccountToken = null; }
    });
    refreshingAccount = pending;
  }
  return refreshingAccount;
}

async function credentialRequest(server, method, token, body, provider) {
  var response = await fetch(server + "/api/public/credentials" + (provider ? "?provider=" + encodeURIComponent(provider) : ""), {
    method: method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined, redirect: "error", cache: "no-store",
  });
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    var error = new Error(data.error || "Couldn't access encrypted key storage. Update your Pagewright server and try again.");
    error.requiresSignIn = response.status === 401;
    throw error;
  }
  return data;
}

async function getAISettings() {
  await storageReady;
  var local = await chrome.storage.local.get(["aiSettings", "account"]);
  var ai = local.aiSettings;
  var metadata = ai ? { provider: ai.provider, model: ai.model, userId: ai.userId } : null;
  if (!local.account) return { user: null, credentials: [], settings: metadata, legacyKeyPresent: !!(ai && ai.apiKey) };
  var server = serverAddress(await getServer());
  var token = await accountToken(server);
  if (!token) return { user: null, credentials: [], settings: metadata };
  // Migrate older device-only keys for the signed-in user. Only discard the
  // local plaintext after the authenticated encrypted save has succeeded.
  if (ai && ai.apiKey) {
    var saved = await credentialRequest(server, "POST", token, { provider: ai.provider, apiKey: ai.apiKey });
    metadata = { provider: ai.provider, model: ai.model, userId: saved.userId };
    await chrome.storage.local.set({ aiSettings: metadata });
  }
  var data = await credentialRequest(server, "GET", token);
  return { user: data.user, credentials: data.credentials, settings: metadata && (!metadata.userId || metadata.userId === data.user.id) ? metadata : null };
}

async function saveAISettings(message) {
  var server = serverAddress(DEFAULT_SERVER);
  if (!["openrouter", "anthropic", "openai"].includes(message.provider) || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(message.model || "")) throw new Error("Choose a provider and model.");
  var token = await accountToken(server);
  if (!token) throw new Error("Sign in before saving your encrypted API key.");
  var key = (message.apiKey || "").trim();
  if (key && (key.length > 4096 || /\s/.test(key))) throw new Error("Enter a valid API key.");
  var userId;
  if (key) userId = (await credentialRequest(server, "POST", token, { provider: message.provider, apiKey: key })).userId;
  else {
    var data = await credentialRequest(server, "GET", token);
    if (!data.credentials.some(function (credential) { return credential.provider === message.provider; })) throw new Error("Add an API key for this provider.");
    userId = data.user.id;
  }
  await chrome.storage.local.set({ aiSettings: { provider: message.provider, model: message.model, userId: userId } });
  return { saved: true };
}

async function removeAIKey(provider) {
  var server = serverAddress(await getServer());
  var token = await accountToken(server);
  if (!token) throw new Error("Sign in to remove your saved key.");
  await credentialRequest(server, "DELETE", token, null, provider);
  return { removed: true };
}

function getServer() { return Promise.resolve(DEFAULT_SERVER); }

function setState(tabId, patch) {
  var key = "last:" + tabId;
  return chrome.storage.session.get(key).then(function (r) {
    var next = Object.assign({}, r[key] || {}, patch, { updatedAt: Date.now() });
    var obj = {};
    obj[key] = next;
    return chrome.storage.session.set(obj).then(function () { return next; });
  });
}

function inTab(tabId, func, args) {
  return chrome.scripting
    .executeScript({ target: { tabId: tabId }, files: ["pagewright.js"] })
    .then(function () {
      return chrome.scripting.executeScript({ target: { tabId: tabId }, func: func, args: args || [] });
    })
    .then(function (res) { return res && res[0] ? res[0].result : undefined; });
}

async function pickElement(tabId) {
  await setState(tabId, { picking: true });
  try {
    var picked = await inTab(tabId, function () { return globalThis.Pagewright.pick(); });
    await setState(tabId, { picking: false, target: picked || null });
  } catch (e) {
    await setState(tabId, { picking: false, error: String((e && e.message) || e), status: "error" });
  }
}

async function run(tabId, instruction) {
  var target = ((await chrome.storage.session.get("last:" + tabId))["last:" + tabId] || {}).target || null;
  await setState(tabId, {
    status: "reading", instruction: instruction, summary: null, results: null, operations: null, error: null, requiresSetup: false,
  });
  try {
    await storageReady;
    var ai = (await chrome.storage.local.get("aiSettings")).aiSettings;
    if (!ai || !["openrouter", "anthropic", "openai"].includes(ai.provider) || !ai.userId || !ai.model) {
      await setState(tabId, { status: "error", error: "Sign in and save your encrypted API key in Settings to start.", requiresSetup: true });
      return;
    }
    var server = serverAddress(await getServer());
    var token = await accountToken(server);
    if (!token) {
      await setState(tabId, { status: "error", error: "Sign in to use your encrypted API key.", requiresSetup: true, requiresSignIn: true });
      return;
    }
    // Check compatibility without a key or page data before contacting an older
    // server that might otherwise ignore BYOK and bill its shared provider key.
    var capabilityResponse = await fetch(server + "/api/public/reshape", { method: "GET", cache: "no-store", redirect: "error" });
    var capabilities = await capabilityResponse.json().catch(function () { return {}; });
    if (!capabilityResponse.ok || capabilities.authentication !== "account-key" || capabilities.version !== 2 ||
        !Array.isArray(capabilities.providers) || !capabilities.providers.includes(ai.provider)) {
      throw new Error("The Pagewright server needs an update for encrypted account keys. Update the server and extension together.");
    }
    var page = await inTab(tabId, function () {
      return {
        dom: globalThis.Pagewright.snapshot(),
        url: location.href,
        title: document.title,
        host: location.hostname,
        path: location.pathname,
      };
    });
    if (!page) throw new Error("Couldn't read this page.");
    await setState(tabId, { status: "thinking", host: page.host, path: page.path });

    var res = await fetch(server + "/api/public/reshape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ provider: ai.provider, model: ai.model, instruction: instruction, url: page.url, title: page.title, dom: page.dom, target: target }),
      redirect: "error",
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      await setState(tabId, { status: "error", error: data.error || "Server error (" + res.status + ")", requiresSetup: !!data.requiresSetup || res.status === 401 });
      return;
    }

    var ops = data.operations || [];
    await setState(tabId, { status: "applying", summary: data.summary, operations: ops, results: [], saved: false, ruleId: null });
    var results = [];
    for (var i = 0; i < ops.length; i++) {
      var r = await inTab(tabId, function (op) { return globalThis.Pagewright.applyStep(op); }, [ops[i]]);
      results.push(Object.assign({ label: ops[i].label }, r || { ok: false, affected: 0 }));
      await setState(tabId, { results: results.slice() });
      if (i < ops.length - 1) await new Promise(function (ok) { setTimeout(ok, 450); });
    }
    await setState(tabId, { status: "done", results: results });
    // Persist automatically for this site; the panel can widen it to all sites or undo it.
    if (ops.length && results.some(function (x) { return x.ok; })) await saveRule(tabId, false);
  } catch (e) {
    var msg = String((e && e.message) || e);
    if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Couldn't reach the Pagewright server (" + DEFAULT_SERVER + "). Make sure it is running and try again.";
    if (/Cannot access|chrome:\/\/|extensions gallery/i.test(msg)) msg = "Browsers don't allow extensions to change this page.";
    await setState(tabId, { status: "error", error: msg });
  }
}

async function saveRule(tabId, everywhere) {
  var key = "last:" + tabId;
  var last = (await chrome.storage.session.get(key))[key];
  if (!last || !last.operations || !last.operations.length) return false;
  var firstSegment = "/" + ((last.path || "/").split("/")[1] || "");
  var rules = (await chrome.storage.local.get("rules")).rules || [];
  if (last.ruleId) {
    var existing = rules.find(function (r) { return r.id === last.ruleId; });
    if (existing && everywhere) { existing.host = "*"; existing.path = "/"; }
    await chrome.storage.local.set({ rules: rules });
    await setState(tabId, { saved: everywhere ? "all" : "site" });
    return true;
  }
  var id = Math.random().toString(36).slice(2, 10);
  await setState(tabId, { ruleId: id });
  rules.push({
    id: id,
    host: everywhere ? "*" : last.host,
    path: everywhere ? "/" : firstSegment,
    instruction: last.instruction,
    summary: last.summary,
    operations: last.operations,
    enabled: true,
    createdAt: Date.now(),
  });
  await chrome.storage.local.set({ rules: rules });
  await setState(tabId, { saved: everywhere ? "all" : "site" });
  return true;
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg && msg.type === "getRules") {
    storageReady.then(function () { return chrome.storage.local.get("rules"); })
      .then(function (result) { sendResponse({ rules: result.rules || [] }); })
      .catch(function () { sendResponse({ rules: [] }); });
    return true;
  }
  // Only extension pages may initiate editing; content scripts can only read rules.
  if (!_sender.url || !_sender.url.startsWith(chrome.runtime.getURL(""))) return false;
  var action = msg && (msg.type === "getAISettings" ? getAISettings
    : msg.type === "saveAISettings" ? function () { return saveAISettings(msg); }
    : msg.type === "removeAIKey" ? function () { return removeAIKey(msg.provider); }
    : msg.type === "accountToken" ? async function () { return { token: await accountToken(serverAddress(await getServer())) }; }
    : null);
  if (action) {
    action().then(sendResponse).catch(function (error) { sendResponse({ error: error.message || "Couldn't update AI settings.", requiresSignIn: !!error.requiresSignIn }); });
    return true;
  }
  if (msg && msg.type === "run") {
    run(msg.tabId, msg.instruction);
    sendResponse({ started: true });
  } else if (msg && msg.type === "save") {
    saveRule(msg.tabId, !!msg.everywhere).then(function (ok) { sendResponse({ ok: ok }); });
    return true;
  } else if (msg && msg.type === "pick") {
    pickElement(msg.tabId);
    sendResponse({ started: true });
  } else if (msg && msg.type === "clearTarget") {
    setState(msg.tabId, { target: null }).then(function () { sendResponse({ ok: true }); });
    return true;
  } else if (msg && msg.type === "undo") {
    undo(msg.tabId).then(function () { sendResponse({ ok: true }); });
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local" || !changes.rules) return;
  chrome.tabs.query({}).then(function (tabs) {
    tabs.forEach(function (tab) {
      chrome.tabs.sendMessage(tab.id, { type: "rulesChanged" }).catch(function () {});
    });
  }).catch(function () {});
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.remove("last:" + tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.url) chrome.tabs.sendMessage(tabId, { type: "pageChanged" }).catch(function () {});
});

// Open as a docked side panel (like MetaMask) that pushes the page aside.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});

async function undo(tabId) {
  var key = "last:" + tabId;
  var last = (await chrome.storage.session.get(key))[key];
  if (last && last.ruleId) {
    var rules = (await chrome.storage.local.get("rules")).rules || [];
    await chrome.storage.local.set({ rules: rules.filter(function (r) { return r.id !== last.ruleId; }) });
  }
  await chrome.storage.session.remove(key);
  await chrome.tabs.reload(tabId);
}
