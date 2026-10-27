import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const user = { id: "verified-user", username: "test_user" };
const savedAI = { provider: "openrouter", model: "anthropic/claude-opus-5.5", userId: user.id };
type Settings = typeof savedAI;
async function panel(
  options: {
    settings?: Settings;
    store?: Record<string, unknown>;
    cloud?: Set<string>;
    signedIn?: boolean;
  } = {},
) {
  document.body.innerHTML = readFileSync("extension/popup.html", "utf8");
  let active = { id: 1, url: "https://reddit.com" };
  const store: Record<string, unknown> = options.store ?? {
    rules: [],
    ...(options.settings ? { aiSettings: options.settings } : {}),
  };
  const cloud = options.cloud ?? new Set(options.settings ? [options.settings.provider] : []);
  const signedIn = options.signedIn !== false;
  const createTab = vi.fn();
  const sendMessage = vi.fn().mockImplementation(async (message) => {
    if (message.type === "getAISettings")
      return {
        user: signedIn ? user : null,
        settings: store["aiSettings"] || null,
        credentials: [...cloud].map((provider) => ({ provider })),
      };
    if (message.type === "saveAISettings") {
      if (!signedIn) return { error: "Sign in first." };
      if (message.apiKey) cloud.add(message.provider);
      if (!cloud.has(message.provider)) return { error: "Add an API key for this provider." };
      store["aiSettings"] = { provider: message.provider, model: message.model, userId: user.id };
      return { saved: true };
    }
    if (message.type === "removeAIKey") {
      cloud.delete(message.provider);
      return { removed: true };
    }
    return { started: true, saved: true };
  });
  const context = {
    document,
    URL,
    setTimeout,
    chrome: {
      runtime: { sendMessage, getURL: (path: string) => `chrome-extension://test/${path}` },
      tabs: {
        query: async () => [active],
        create: createTab,
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
      },
      storage: {
        session: { get: async () => ({}) },
        local: {
          get: async () => ({ ...store }),
          set: async (patch: object) => Object.assign(store, patch),
        },
        onChanged: { addListener: () => {} },
      },
    },
    refreshTab: async () => {},
    run: () => {},
    initialized: Promise.resolve(),
  };
  runInNewContext(
    readFileSync("extension/config.js", "utf8") + "\n" + readFileSync("extension/popup.js", "utf8"),
    context,
  );
  await context.initialized;
  return {
    context,
    store,
    cloud,
    sendMessage,
    createTab,
    setActive: (tab: typeof active) => {
      active = tab;
    },
  };
}
function field(id: string) {
  return document.getElementById(id) as HTMLInputElement;
}
function choose(provider: string) {
  field("aiProvider").value = provider;
  field("aiProvider").dispatchEvent(new Event("change"));
}
function submit() {
  field("settingsForm").dispatchEvent(new Event("submit", { cancelable: true }));
}
function models() {
  return Array.from((document.getElementById("aiModel") as HTMLSelectElement).options).map(
    (option) => option.value,
  );
}

describe("account key setup, model dropdown and panel continuity", () => {
  it("requires sign-in before accepting an encrypted API key", async () => {
    const app = await panel({ signedIn: false });
    expect(field("settings").hidden).toBe(false);
    expect(field("editor").hidden).toBe(true);
    expect(field("apiKey").disabled).toBe(true);
    expect(field("settingsForm").hidden).toBe(true);
    expect(field("saveSettings").disabled).toBe(true);
    expect(field("settingsTitle").textContent).toBe("Sign in to get started");
    submit();
    expect(app.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "saveAISettings" }));
    field("signInForAI").click();
    await vi.waitFor(() =>
      expect(app.createTab).toHaveBeenCalledWith({
        url: "chrome-extension://test/hub.html?auth=1",
      }),
    );
  });
  it("shows model choices for only the selected provider", async () => {
    await panel();
    expect(field("accountStatus").textContent).toContain("No API key has been saved");
    expect(field("settingsForm").hidden).toBe(false);
    expect(document.getElementById("serverUrl")).toBeNull();
    expect(field("serverStatus").textContent).toContain("https://pagewright-backend.fly.dev");
    expect(field("aiModel").tagName).toBe("SELECT");
    expect(field("aiModel").disabled).toBe(true);
    choose("anthropic");
    expect(models()).toContain("claude-opus-5-5");
    expect(models()).not.toContain("gpt-4.1-mini");
    choose("openai");
    expect(models()).toContain("gpt-4.1-mini");
    expect(models()).not.toContain("claude-opus-5-5");
    choose("openrouter");
    expect(models()).toContain("anthropic/claude-opus-5.5");
    expect(models()).not.toContain("claude-opus-5-5");
  });
  it.each(["anthropic", "openai", "openrouter"])(
    "saves %s through the private credential flow with only metadata remembered locally",
    async (provider) => {
      const app = await panel();
      choose(provider);
      field("apiKey").value = "test-private-key";
      submit();
      await vi.waitFor(() => expect(field("settings").hidden).toBe(true));
      expect(app.store["aiSettings"]).toMatchObject({ provider, userId: user.id });
      expect(field("accountStatus").textContent).toContain("Encrypted API keys saved: 1");
      expect(JSON.stringify(app.store)).not.toContain("test-private-key");
      expect(field("apiKey").value).toBe("");
      field("instruction").value = "Make this dark";
      app.context.run();
      expect(app.sendMessage).toHaveBeenCalledWith({
        type: "run",
        tabId: 1,
        instruction: "Make this dark",
      });
    },
  );
  it("remembers the selected model and saved-key status in a fresh panel without receiving plaintext", async () => {
    const first = await panel();
    choose("openai");
    field("aiModel").value = "gpt-4.1";
    field("apiKey").value = "test-private-key";
    submit();
    await vi.waitFor(() => expect(field("settings").hidden).toBe(true));
    const app = await panel({ store: JSON.parse(JSON.stringify(first.store)), cloud: first.cloud });
    expect(field("settings").hidden).toBe(true);
    expect(field("run").disabled).toBe(false);
    field("settingsBtn").click();
    expect(field("apiKey").value).toBe("");
    expect(field("apiKey").required).toBe(false);
    expect(field("aiModel").value).toBe("gpt-4.1");
    expect(JSON.stringify(app.store)).not.toContain("test-private-key");
  });
  it("keeps the encrypted key when only changing the model and removes it when requested", async () => {
    const app = await panel({ settings: savedAI });
    field("settingsBtn").click();
    field("aiModel").value = "anthropic/claude-sonnet-5.5";
    submit();
    await vi.waitFor(() => expect(field("settings").hidden).toBe(true));
    expect(app.store["aiSettings"]).toMatchObject({ model: "anthropic/claude-sonnet-5.5" });
    field("settingsBtn").click();
    field("removeKey").click();
    await vi.waitFor(() => expect(field("editor").hidden).toBe(true));
    expect(app.cloud.has("openrouter")).toBe(false);
  });
  it("preserves tab drafts and unfinished key input across active-tab changes", async () => {
    const app = await panel({ settings: savedAI });
    field("instruction").value = "First draft";
    app.setActive({ id: 2, url: "https://linkedin.com" });
    await app.context.refreshTab();
    field("instruction").value = "Second draft";
    field("settingsBtn").click();
    choose("openai");
    field("apiKey").value = "unfinished-key";
    app.setActive({ id: 1, url: "https://reddit.com" });
    await app.context.refreshTab();
    expect(field("instruction").value).toBe("First draft");
    expect(field("apiKey").value).toBe("unfinished-key");
  });
});
