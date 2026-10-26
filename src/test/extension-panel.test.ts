import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("extension panel continuity", () => {
  it("keeps each tab's unfinished request when switching away and back", async () => {
    document.body.innerHTML = readFileSync("extension/popup.html", "utf8");
    let active = { id: 1, url: "https://reddit.com" };
    const context = {
      document, URL, setTimeout,
      chrome: {
        tabs: {
          query: async () => [active],
          onActivated: { addListener: () => {} },
          onUpdated: { addListener: () => {} },
        },
        storage: {
          session: { get: async () => ({}) },
          local: { get: async () => ({ rules: [] }) },
          onChanged: { addListener: () => {} },
        },
      },
      refreshTab: async () => {},
    };
    runInNewContext(readFileSync("extension/popup.js", "utf8"), context);
    await context.refreshTab();
    const instruction = document.getElementById("instruction") as HTMLTextAreaElement;
    instruction.value = "Make this easier to read";
    active = { id: 2, url: "https://linkedin.com" };
    await context.refreshTab();
    instruction.value = "Move search down";
    active = { id: 1, url: "https://reddit.com" };
    await context.refreshTab();
    expect(instruction.value).toBe("Make this easier to read");
    active = { id: 2, url: "https://linkedin.com" };
    await context.refreshTab();
    expect(instruction.value).toBe("Move search down");
  });
});