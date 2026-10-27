/* Re-apply enabled saved setups on reload, navigation and late-rendered content. */
(function () {
  if (globalThis.__pagewrightContent) return;
  globalThis.__pagewrightContent = true;

  var rules = [];
  var clicked = new Set();
  var timer = null;
  var retry = null;
  var observer = null;
  var applying = false;
  var lastPath = location.pathname;
  var loadVersion = 0;

  function activeRules() {
    var host = location.hostname.replace(/^www\./, "");
    var path = location.pathname;
    return rules.filter(function (r) {
      var scope = r.path || "/";
      return r.enabled && (r.host === "*" || r.host.replace(/^www\./, "") === host) &&
        (scope === "/" || path === scope || path.indexOf(scope.replace(/\/$/, "") + "/") === 0);
    });
  }

  function observe() {
    if (!rules.some(function (r) { return r.enabled; }) || !document.documentElement) return;
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    if (observer) observer.disconnect();
    try {
      if (location.pathname !== lastPath) { clicked.clear(); lastPath = location.pathname; }
      var list = activeRules();
      document.querySelectorAll('style[id^="pagewright-style-"]').forEach(function (style) {
        var id = style.id.replace("pagewright-style-", "");
        if (id !== "live" && !list.some(function (rule) { return rule.id === id; })) style.remove();
      });
      list.forEach(function (rule) {
        (rule.operations || []).forEach(function (op, index) {
          var clickKey = rule.id + ":" + index;
          var results = globalThis.Pagewright.apply([op], { ruleId: rule.id, skipClicks: clicked.has(clickKey) });
          // A click whose target has not rendered yet must remain eligible.
          if (op.type === "click" && results && results[0] && results[0].ok && results[0].affected > 0) clicked.add(clickKey);
        });
      });
    } finally {
      applying = false;
      observe();
    }
  }

  function schedule() {
    // A fixed pending run cannot be starved by continuously changing feeds.
    if (timer !== null) return;
    timer = setTimeout(function () { timer = null; applyAll(); }, 250);
  }

  function load() {
    var version = ++loadVersion;
    return chrome.runtime.sendMessage({ type: "getRules" }).then(function (response) {
      if (version !== loadVersion || !response) return;
      clearTimeout(retry);
      rules = response.rules || [];
      clearTimeout(timer);
      timer = null;
      applyAll();
    }).catch(function () {
      // The service worker can be waking up when a page first loads.
      clearTimeout(retry);
      retry = setTimeout(load, 1000);
    });
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message && (message.type === "rulesChanged" || message.type === "pageChanged")) load();
  });
  window.addEventListener("pageshow", function (event) { if (event.persisted) load(); });
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  load();
})();
