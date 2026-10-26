import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type Op = Record<string, unknown>;
type PW = {
  parseDate: (raw: string, now?: number) => number | null;
  apply: (ops: Op[], ctx?: Record<string, unknown>) => { ok: boolean; affected: number }[];
  snapshot: (root?: Element) => string;
};

let pw: PW;
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const H = 3600000;
const D = 24 * H;

beforeAll(async () => {
  // @ts-expect-error plain browser script without type declarations
  await import("../../extension/pagewright.js");
  pw = (globalThis as unknown as { Pagewright: PW }).Pagewright;
});

const baseSort = {
  type: "sort",
  selector: "#feed",
  itemSelector: ".post",
  keySelector: ".time",
  keyAttribute: null,
  keyType: "date",
  property: null,
  value: null,
};

function feedOrder() {
  return Array.from(document.querySelectorAll(".post")).map((p) => p.getAttribute("data-name"));
}

describe("relative date parsing", () => {
  it("reads LinkedIn English relative times", () => {
    expect(pw.parseDate("5h • Edited", NOW)).toBe(NOW - 5 * H);
    expect(pw.parseDate("3d •", NOW)).toBe(NOW - 3 * D);
    expect(pw.parseDate("1w", NOW)).toBe(NOW - 7 * D);
  });

  it("reads LinkedIn Dutch relative times", () => {
    expect(pw.parseDate("5 u • ", NOW)).toBe(NOW - 5 * H);
    expect(pw.parseDate("2 d", NOW)).toBe(NOW - 2 * D);
    expect(pw.parseDate("gisteren", NOW)).toBe(NOW - D);
  });

  it("reads absolute ISO dates", () => {
    expect(pw.parseDate("2026-10-20T10:00:00Z", NOW)).toBe(Date.UTC(2026, 9, 20, 10));
  });
});

describe("chronological sort", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="feed">
        <div class="ad">sponsored</div>
        <div><div class="post" data-name="a"><span class="time">3d</span></div></div>
        <div><div class="post" data-name="b"><span class="time">5h</span></div></div>
        <div><div class="post" data-name="c"><span class="time">1w</span></div></div>
        <div><div class="post" data-name="d"><span class="time">20m</span></div></div>
      </div>`;
  });

  it("puts newest first for desc", () => {
    pw.apply([{ ...baseSort, order: "desc", __now: NOW }]);
    expect(feedOrder()).toEqual(["d", "b", "a", "c"]);
  });

  it("puts oldest first for asc", () => {
    pw.apply([{ ...baseSort, order: "asc", __now: NOW }]);
    expect(feedOrder()).toEqual(["c", "a", "b", "d"]);
  });

  it("leaves non-item children where they were", () => {
    pw.apply([{ ...baseSort, order: "desc", __now: NOW }]);
    expect(document.querySelector("#feed")!.firstElementChild!.className).toBe("ad");
  });
});

describe("filter", () => {
  it("keeps only items with a keyword", () => {
    document.body.innerHTML = `<p class="i">AI news</p><p class="i">Sports</p><p class="i">More ai</p>`;
    const [res] = pw.apply([
      { type: "filter", selector: ".i", value: "ai", property: "keep" },
    ]);
    expect(res?.affected).toBe(1);
    const visible = Array.from(document.querySelectorAll<HTMLElement>(".i")).filter(
      (el) => el.style.display !== "none",
    );
    expect(visible.map((el) => el.textContent)).toEqual(["AI news", "More ai"]);
  });
});

describe("click ops on re-apply", () => {
  it("are skipped when re-applying a saved change", () => {
    document.body.innerHTML = `<button id="b">Recent</button>`;
    let clicks = 0;
    document.getElementById("b")!.addEventListener("click", () => clicks++);
    pw.apply([{ type: "click", selector: "#b" }], { skipClicks: true });
    expect(clicks).toBe(0);
  });
});
