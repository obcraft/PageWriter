/* Pagewright core: page outline + local DOM operations. Runs in the extension's isolated world. */
(function () {
  if (globalThis.Pagewright) return;

  var SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "IFRAME", "LINK", "META", "TEMPLATE",
    "CANVAS", "VIDEO", "AUDIO", "PICTURE", "SOURCE", "BR", "HR", "WBR",
  ]);
  var KEEP_ATTRS = [
    "datetime", "role", "aria-label", "name", "type", "title", "placeholder", "for",
  ];
  var MAX_CHARS = 60000;
  var MAX_SIMILAR = 6;

  function clip(str, n) {
    str = String(str).replace(/\s+/g, " ").trim();
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  function signature(el) {
    return el.tagName + "." + Array.prototype.slice.call(el.classList, 0, 2).join(".");
  }

  function describe(el) {
    var out = el.tagName.toLowerCase();
    if (el.id) out += "#" + clip(el.id, 50);
    var classes = Array.prototype.slice.call(el.classList, 0, 4);
    for (var i = 0; i < classes.length; i++) out += "." + clip(classes[i], 45);
    var attrs = [];
    for (var j = 0; j < el.attributes.length; j++) {
      var a = el.attributes[j];
      if (a.name.indexOf("data-") === 0 || KEEP_ATTRS.indexOf(a.name) !== -1) {
        if (a.value && attrs.length < 4) attrs.push(a.name + '="' + clip(a.value, 60) + '"');
      }
    }
    if (el.tagName === "A" && el.getAttribute("href")) {
      attrs.push('href="' + clip(el.getAttribute("href"), 50) + '"');
    }
    if (attrs.length) out += " [" + attrs.join(" ") + "]";
    var text = "";
    for (var k = 0; k < el.childNodes.length; k++) {
      var n = el.childNodes[k];
      if (n.nodeType === 3) text += n.textContent;
    }
    text = clip(text, 70);
    if (text) out += ' "' + text + '"';
    return out;
  }

  function isPlainWrapper(el) {
    return (
      (el.tagName === "DIV" || el.tagName === "SPAN") &&
      !el.id && el.classList.length === 0 && el.attributes.length === 0 &&
      el.children.length === 1
    );
  }

  function snapshot(root) {
    root = root || document.body;
    var lines = [];
    var size = 0;
    var truncated = false;

    function push(line) {
      if (size > MAX_CHARS) { truncated = true; return false; }
      lines.push(line);
      size += line.length + 1;
      return true;
    }

    function walk(el, depth) {
      if (truncated || SKIP_TAGS.has(el.tagName.toUpperCase())) return;
      if (el.hidden || el.getAttribute("aria-hidden") === "true") return;
      if (el.id && el.id.indexOf("pagewright") === 0) return;
      if (isPlainWrapper(el)) return walk(el.children[0], depth);
      if (!push("  ".repeat(Math.min(depth, 30)) + describe(el))) return;
      var children = el.children;
      var seen = Object.create(null);
      var skipped = Object.create(null);
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        var sig = signature(c);
        seen[sig] = (seen[sig] || 0) + 1;
        if (seen[sig] > MAX_SIMILAR) { skipped[sig] = (skipped[sig] || 0) + 1; continue; }
        walk(c, depth + 1);
      }
      for (var s in skipped) {
        var parts = s.split(".");
        var label = parts[0].toLowerCase() + (parts.slice(1).filter(Boolean).length ? "." + parts.slice(1).filter(Boolean).join(".") : "");
        push("  ".repeat(Math.min(depth + 1, 30)) + "… " + skipped[s] + " more <" + label + "> siblings");
      }
    }

    walk(root, 0);
    if (truncated) lines.push("… (outline truncated)");
    return lines.join("\n");
  }

  /* ---------- date parsing ---------- */
  var UNIT_MS = {
    s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 2592000000, y: 31536000000,
  };
  var UNIT_WORDS = [
    [/^(s|sec|secs|second|seconds|sec\.|seconde|seconden)$/, "s"],
    [/^(m|min|mins|minute|minutes|minuut|minuten)$/, "m"],
    [/^(h|hr|hrs|hour|hours|u|uur|uren|std)$/, "h"],
    [/^(d|day|days|dag|dagen)$/, "d"],
    [/^(w|wk|wks|week|weeks|weken)$/, "w"],
    [/^(mo|mos|mon|month|months|mnd|maand|maanden)$/, "mo"],
    [/^(y|yr|yrs|year|years|j|jr|jaar|jaren)$/, "y"],
  ];

  function unitFor(word) {
    for (var i = 0; i < UNIT_WORDS.length; i++) if (UNIT_WORDS[i][0].test(word)) return UNIT_WORDS[i][1];
    return null;
  }

  /** Returns a timestamp (ms) or null. `now` is injectable for tests. */
  function parseDate(raw, now) {
    if (raw == null) return null;
    now = now == null ? Date.now() : now;
    var text = String(raw).toLowerCase().replace(/\s+/g, " ").trim();
    if (!text) return null;
    if (/^(just now|now|zojuist|nu|net|moments? ago)/.test(text)) return now;
    if (/^(yesterday|gisteren)/.test(text)) return now - UNIT_MS.d;
    if (/^(today|vandaag)/.test(text)) return now;
    var rel = text.match(/(\d+)\s*([a-z]+)\.?(?:\s|•|·|$|,|ago|geleden)/);
    if (!rel) rel = text.match(/^(\d+)\s*([a-z]+)$/);
    if (rel) {
      var unit = unitFor(rel[2]);
      if (unit) return now - parseInt(rel[1], 10) * UNIT_MS[unit];
    }
    if (/^\d{9,13}$/.test(text)) {
      var num = parseInt(text, 10);
      return text.length <= 10 ? num * 1000 : num;
    }
    var abs = Date.parse(raw);
    if (!isNaN(abs)) return abs;
    return null;
  }

  function readKey(item, op) {
    var target = op.keySelector ? item.querySelector(op.keySelector) : item;
    if (!target) return null;
    var raw = op.keyAttribute ? target.getAttribute(op.keyAttribute) : target.textContent;
    if (raw == null) return null;
    if (op.keyType === "date") return parseDate(raw, op.__now);
    if (op.keyType === "number") {
      var m = String(raw).replace(/[\s,](?=\d{3}\b)/g, "").match(/-?\d+(?:[.,]\d+)?/);
      if (!m) return null;
      var n = parseFloat(m[0].replace(",", "."));
      if (/\d\s*k\b/i.test(raw)) n *= 1000;
      if (/\d\s*m\b/i.test(raw)) n *= 1000000;
      return n;
    }
    return clip(raw, 200).toLowerCase();
  }

  /** Walk up from `el` to the ancestor that is a direct child of `container`. */
  function topUnder(container, el) {
    while (el && el.parentElement !== container) el = el.parentElement;
    return el;
  }

  function opSort(op) {
    var containers = op.selector ? document.querySelectorAll(op.selector) : [document.body];
    var affected = 0;
    Array.prototype.forEach.call(containers, function (container) {
      var items = op.itemSelector
        ? Array.prototype.slice.call(container.querySelectorAll(op.itemSelector))
        : Array.prototype.slice.call(container.children);
      // Drop nested matches (an item inside another item).
      items = items.filter(function (it) {
        return !items.some(function (other) { return other !== it && other.contains(it); });
      });
      var units = [];
      var seen = new Set();
      items.forEach(function (it, index) {
        var unit = topUnder(container, it);
        if (!unit || seen.has(unit)) return;
        seen.add(unit);
        units.push({ el: unit, key: readKey(it, op), index: index });
      });
      if (units.length < 2) return;
      var dir = op.order === "desc" ? -1 : 1;
      var sorted = units.slice().sort(function (a, b) {
        if (a.key == null && b.key == null) return a.index - b.index;
        if (a.key == null) return 1;
        if (b.key == null) return -1;
        if (a.key < b.key) return -1 * dir;
        if (a.key > b.key) return 1 * dir;
        return a.index - b.index;
      });
      var changed = sorted.some(function (u, i) { return u !== units[i]; });
      if (!changed) { affected += units.length; return; }
      // Re-insert sorted units at the position of the first unit, leaving other children in place.
      var anchor = document.createComment("pagewright");
      container.insertBefore(anchor, units[0].el);
      sorted.forEach(function (u) { container.insertBefore(u.el, anchor); });
      anchor.remove();
      affected += units.length;
    });
    return affected;
  }

  function each(selector, fn) {
    var els = document.querySelectorAll(selector);
    Array.prototype.forEach.call(els, fn);
    return els.length;
  }

  function opFilter(op) {
    var words = String(op.value || "").toLowerCase().split("|").map(function (w) { return w.trim(); }).filter(Boolean);
    if (!words.length) return 0;
    var keep = op.property !== "hide";
    var hidden = 0;
    each(op.selector, function (el) {
      var text = (el.textContent || "").toLowerCase();
      var match = words.some(function (w) { return text.indexOf(w) !== -1; });
      var shouldHide = keep ? !match : match;
      if (shouldHide) { el.style.setProperty("display", "none", "important"); hidden++; }
      else if (el.style.display === "none") el.style.removeProperty("display");
    });
    return hidden;
  }

  function opCss(op, ruleId) {
    var id = "pagewright-style-" + (ruleId || "live");
    var style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== op.value) style.textContent = op.value || "";
    return 1;
  }

  // Place `el` relative to `target`. position: before | after | prepend | append (default).
  function place(el, target, position) {
    switch (position) {
      case "before": if (target.previousSibling !== el) target.parentNode.insertBefore(el, target); break;
      case "after": if (target.nextSibling !== el) target.parentNode.insertBefore(el, target.nextSibling); break;
      case "prepend": if (target.firstChild !== el) target.insertBefore(el, target.firstChild); break;
      default: if (target.lastChild !== el) target.appendChild(el);
    }
  }

  // move: selector = element(s) to move, value = target selector, property = position.
  function opMove(op) {
    var target = document.querySelector(op.value);
    if (!target) throw new Error("Target not found");
    var moved = 0;
    each(op.selector, function (el) {
      if (el === target || el.contains(target)) return;
      place(el, target, op.property);
      moved++;
    });
    return moved;
  }

  // Strip anything executable from AI-provided markup.
  function sanitize(node) {
    node.querySelectorAll("script,iframe,object,embed,link,meta,base").forEach(function (n) { n.remove(); });
    node.querySelectorAll("*").forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var name = a.name.toLowerCase();
        if (name.indexOf("on") === 0 || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
      });
    });
  }

  // insert: selector = anchor, value = HTML, property = position. Idempotent per rule.
  function opInsert(op, ruleId) {
    var mark = "pw-" + (ruleId || "live") + "-" + hash(op.selector + "|" + op.property + "|" + op.value);
    if (document.querySelector('[data-pagewright="' + mark + '"]')) return 0;
    var target = document.querySelector(op.selector);
    if (!target) throw new Error("Target not found");
    var tpl = document.createElement("template");
    tpl.innerHTML = op.value || "";
    sanitize(tpl.content);
    var wrap = document.createElement("div");
    wrap.setAttribute("data-pagewright", mark);
    wrap.style.display = "contents";
    wrap.appendChild(tpl.content);
    place(wrap, target, op.property);
    return 1;
  }

  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function applyOne(op, ctx) {
    switch (op.type) {
      case "sort": return opSort(op);
      case "filter": return opFilter(op);
      case "hide": return each(op.selector, function (el) { el.style.setProperty("display", "none", "important"); });
      case "show": return each(op.selector, function (el) { el.style.removeProperty("display"); el.hidden = false; });
      case "remove": return each(op.selector, function (el) { el.remove(); });
      case "style": return each(op.selector, function (el) { el.style.setProperty(op.property, op.value, "important"); });
      case "text": return each(op.selector, function (el) { if (el.textContent !== op.value) el.textContent = op.value; });
      case "attribute": return each(op.selector, function (el) { el.setAttribute(op.property, op.value); });
      case "click": {
        if (ctx && ctx.skipClicks) return 0;
        var el = document.querySelector(op.selector);
        if (!el) return 0;
        el.click();
        return 1;
      }
      case "css": return opCss(op, ctx && ctx.ruleId);
      case "move": return opMove(op);
      case "insert": return opInsert(op, ctx && ctx.ruleId);
      default: throw new Error("Unknown operation: " + op.type);
    }
  }

  function apply(operations, ctx) {
    return (operations || []).map(function (op) {
      try {
        if (op.type !== "css" && !op.selector && op.type !== "sort") throw new Error("Missing selector");
        return { type: op.type, ok: true, affected: applyOne(op, ctx) };
      } catch (e) {
        return { type: op.type, ok: false, affected: 0, error: String(e && e.message || e) };
      }
    });
  }

  globalThis.Pagewright = { snapshot: snapshot, apply: apply, parseDate: parseDate };
})();
