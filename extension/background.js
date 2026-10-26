/* Pagewright background: reads the page, asks the AI for a plan, applies it locally. */
var DEFAULT_SERVER = "https://project--113b80e6-3c46-4339-b113-b0987ed33340.lovable.app";

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

async function run(tabId, instruction) {
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
      body: JSON.stringify({ instruction: instruction, url: page.url, title: page.title, dom: page.dom }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Server error (" + res.status + ")");

    await setState(tabId, { status: "applying", summary: data.summary, operations: data.operations });
    var results = await inTab(tabId, function (ops) { return globalThis.Pagewright.apply(ops); }, [data.operations || []]);
    await setState(tabId, { status: "done", results: results || [] });
  } catch (e) {
    var msg = String((e && e.message) || e);
    if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Couldn't reach the Pagewright server. Check the server address in settings.";
    if (/Cannot access|chrome:\/\/|extensions gallery/i.test(msg)) msg = "Browsers don't allow extensions to change this page.";
    await setState(tabId, { status: "error", error: msg });
  }
}

async function saveRule(tabId) {
  var key = "last:" + tabId;
  var last = (await chrome.storage.session.get(key))[key];
  if (!last || !last.operations || !last.operations.length) return false;
  var firstSegment = "/" + ((last.path || "/").split("/")[1] || "");
  var rules = (await chrome.storage.local.get("rules")).rules || [];
  rules.push({
    id: Math.random().toString(36).slice(2, 10),
    host: last.host,
    path: firstSegment,
    instruction: last.instruction,
    summary: last.summary,
    operations: last.operations,
    enabled: true,
    createdAt: Date.now(),
  });
  await chrome.storage.local.set({ rules: rules });
  await setState(tabId, { saved: true });
  return true;
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg && msg.type === "run") {
    run(msg.tabId, msg.instruction);
    sendResponse({ started: true });
  } else if (msg && msg.type === "save") {
    saveRule(msg.tabId).then(function (ok) { sendResponse({ ok: ok }); });
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.remove("last:" + tabId);
});
