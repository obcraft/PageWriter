import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = readFileSync("extension/pagewright.js", "utf8");
const content = readFileSync("extension/content.js", "utf8");
type TestDom = { window: Window & typeof globalThis };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string }) => TestDom;
};
const windows: TestDom[] = [];
const rule = {
  id: "saved",
  enabled: true,
  host: "example.com",
  path: "/feed",
  operations: [{ type: "hide", selector: "aside" }],
};
async function page(html: string, rules = [rule], path = "/feed") {
  const dom = new JSDOM(html, { url: "https://example.com" + path });
  windows.push(dom);
  let onMessage: (message: object) => void = () => {};
  const sendMessage = vi.fn().mockResolvedValue({ rules: JSON.parse(JSON.stringify(rules)) });
  const fetch = vi.fn();
  const context = {
    document: dom.window.document,
    location: dom.window.location,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    setTimeout,
    clearTimeout,
    fetch,
    chrome: {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (fn: typeof onMessage) => {
            onMessage = fn;
          },
        },
      },
    },
  };
  runInNewContext(core + "\n" + content, context);
  await Promise.resolve();
  await Promise.resolve();
  return {
    dom,
    document: dom.window.document,
    fetch,
    sendMessage,
    message: (message: object) => onMessage(message),
  };
}
async function settle() {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(300);
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  windows.splice(0).forEach((dom) => dom.window.close());
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("automatic saved setups", () => {
  it("reapplies persisted changes in a fresh page after reload, without AI or a panel", async () => {
    const first = await page("<aside>Ad</aside>");
    expect(first.document.querySelector<HTMLElement>("aside")!.style.display).toBe("none");
    first.dom.window.close();
    const reloaded = await page("<aside>Ad</aside>");
    expect(reloaded.document.querySelector<HTMLElement>("aside")!.style.display).toBe("none");
    expect(reloaded.sendMessage).toHaveBeenCalledWith({ type: "getRules" });
    expect(reloaded.fetch).not.toHaveBeenCalled();
  });
  it("handles late-rendered content and styles that the website resets", async () => {
    const app = await page("<main>Loading</main>");
    app.document.body.insertAdjacentHTML("beforeend", "<aside>Late ad</aside>");
    await settle();
    const aside = app.document.querySelector<HTMLElement>("aside")!;
    expect(aside.style.display).toBe("none");
    aside.style.display = "block";
    await settle();
    expect(aside.style.display).toBe("none");
  });
  it("does not wait forever on continuously changing pages", async () => {
    const app = await page("<main></main>");
    app.document.body.insertAdjacentHTML("beforeend", "<aside>Ad</aside>");
    for (let i = 0; i < 4; i++) {
      app.document.querySelector("main")!.appendChild(app.document.createElement("span"));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(app.document.querySelector<HTMLElement>("aside")!.style.display).toBe("none");
  });
  it("retries each click until its target appears and clicks it once per page", async () => {
    const clicks = [
      { type: "click", selector: "#first" },
      { type: "click", selector: "#second" },
    ];
    const app = await page("<main></main>", [{ ...rule, operations: clicks }]);
    const first = app.document.createElement("button");
    first.id = "first";
    const firstClick = vi.fn();
    first.addEventListener("click", firstClick);
    app.document.body.appendChild(first);
    await settle();
    const second = app.document.createElement("button");
    second.id = "second";
    const secondClick = vi.fn();
    second.addEventListener("click", secondClick);
    app.document.body.appendChild(second);
    await settle();
    app.document.body.appendChild(app.document.createElement("p"));
    await settle();
    expect(firstClick).toHaveBeenCalledTimes(1);
    expect(secondClick).toHaveBeenCalledTimes(1);
  });
  it("activates a setup when navigating to its page without a full reload", async () => {
    const app = await page("<aside>Ad</aside>", [rule], "/other");
    expect(app.document.querySelector<HTMLElement>("aside")!.style.display).toBe("");
    app.dom.window.history.pushState({}, "", "/feed");
    app.message({ type: "pageChanged" });
    await settle();
    expect(app.document.querySelector<HTMLElement>("aside")!.style.display).toBe("none");
  });
  it("does not apply disabled setups or rules for a similarly named path", async () => {
    const disabled = await page("<aside>Ad</aside>", [{ ...rule, enabled: false }]);
    expect(disabled.document.querySelector<HTMLElement>("aside")!.style.display).toBe("");
    const otherPath = await page("<aside>Ad</aside>", [rule], "/feedback");
    expect(otherPath.document.querySelector<HTMLElement>("aside")!.style.display).toBe("");
  });
});
