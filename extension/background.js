/* Pagewright background: reads the page, asks the AI for a plan, applies it locally. */
var DEFAULT_SERVER = "https://project--9e9f7a85-4d83-4522-9e31-420744d88dd9.lovable.app";

function getServer() {
  return chrome.storage.local.get("serverUrl").then(function (r) {
    return (r.serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
  });
}

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
    status: "reading", instruction: instruction, summary: null, results: null, operations: null, error: null,
  });
  try {
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

    var server = await getServer();
    var res = await fetch(server + "/api/public/reshape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: instruction, url: page.url, title: page.title, dom: page.dom, target: target }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Server error (" + res.status + ")");

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
    if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Couldn't reach the Pagewright server. Check the server address in settings.";
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

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.remove("last:" + tabId);
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
