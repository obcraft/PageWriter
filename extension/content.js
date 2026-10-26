/* Pagewright: re-applies changes you chose to keep for this site, also as new content loads. */
(function () {
  if (globalThis.__pagewrightContent) return;
  globalThis.__pagewrightContent = true;

  var rules = [];
  var clicked = new Set();
  var timer = null;
  var observer = null;
  var applying = false;

  function activeRules() {
    var host = location.hostname;
    var path = location.pathname;
    return rules.filter(function (r) {
      return r.enabled && r.host === host && (r.path === "/" || path.indexOf(r.path) === 0);
    });
  }

  function applyAll() {
    var list = activeRules();
    if (!list.length || applying) return;
    applying = true;
    if (observer) observer.disconnect();
    try {
      list.forEach(function (rule) {
        var skipClicks = clicked.has(rule.id);
        globalThis.Pagewright.apply(rule.operations, { ruleId: rule.id, skipClicks: skipClicks });
        clicked.add(rule.id);
      });
    } finally {
      applying = false;
      observe();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(applyAll, 700);
  }

  function observe() {
    if (!document.body) return;
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function load() {
    chrome.storage.local.get("rules").then(function (r) {
      rules = r.rules || [];
      // Remove styles from rules that were deleted or disabled.
      document.querySelectorAll('style[id^="pagewright-style-"]').forEach(function (s) {
        var id = s.id.replace("pagewright-style-", "");
        if (id !== "live" && !activeRules().some(function (rule) { return rule.id === id; })) s.remove();
      });
      if (activeRules().length) {
        applyAll();
      } else if (observer) {
        observer.disconnect();
      }
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.rules) load();
  });

  load();
})();
