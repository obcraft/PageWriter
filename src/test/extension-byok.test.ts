import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const user = { id: "verified-user", username: "test_user" };
const settings = { provider: "anthropic", model: "claude-opus-5-5", userId: user.id };
function background(aiSettings?: object) {
  const local: Record<string, unknown> = {
    aiSettings,
    rules: [],
    account: { accessToken: "test-account-token", expiresAt: Date.now() / 1000 + 3600 },
  };
  const session: Record<string, unknown> = {};
  const upstream = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith("/reshape") && init.method === "GET")
      return Response.json({
        authentication: "account-key",
        providers: ["anthropic", "openai", "openrouter"],
        version: 2,
      });
    if (url.includes("/credentials"))
      return Response.json(
        init.method === "POST"
          ? { saved: true, userId: user.id }
          : { user, credentials: [{ provider: "anthropic" }] },
      );
    return Response.json({ summary: "No changes", operations: [] });
  });
  const executeScript = vi.fn().mockResolvedValue([
    {
      result: {
        dom: "body main",
        url: "https://example.com",
        title: "Example",
        host: "example.com",
        path: "/",
      },
    },
  ]);
  type Reply = (response: unknown) => void;
  let listener: (message: unknown, sender: { url: string }, reply: Reply) => boolean = () => false;
  const setAccessLevel = vi.fn().mockResolvedValue(undefined);
  const context = {
    URL,
    fetch: upstream,
    setTimeout,
    console,
    PagewrightConfig: { serverUrl: "http://127.0.0.1:5173" },
    importScripts: vi.fn(),
    chrome: {
      storage: {
        local: {
          setAccessLevel,
          get: async () => local,
          set: async (patch: object) => Object.assign(local, patch),
          remove: async (key: string) => {
            delete local[key];
          },
        },
        session: {
          get: async () => session,
          set: async (patch: object) => Object.assign(session, patch),
          remove: vi.fn(),
        },
        onChanged: { addListener: vi.fn() },
      },
      scripting: { executeScript },
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
      },
      tabs: {
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        query: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
      sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    },
    run: async (_tab: number, _instruction: string) => {},
    accountToken: async (_server: string): Promise<string | null> => null,
    getAISettings: async (): Promise<Record<string, unknown>> => ({}),
    saveAISettings: async (_msg: object) => ({}),
  };
  runInNewContext(readFileSync("extension/background.js", "utf8"), context);
  return {
    context,
    local,
    session,
    upstream,
    executeScript,
    setAccessLevel,
    message: (msg: unknown, url: string, reply: Reply) => listener(msg, { url }, reply),
  };
}

describe("encrypted account-key boundary", () => {
  it("blocks unconfigured requests before reading or sending the page", async () => {
    const app = background();
    await app.context.run(1, "Make this dark");
    expect(app.executeScript).not.toHaveBeenCalled();
    expect(app.upstream).not.toHaveBeenCalled();
    expect(app.session["last:1"]).toMatchObject({ status: "error", requiresSetup: true });
  });
  it("uses the account session, fixed server and selected provider without sending a plaintext provider key", async () => {
    const app = background(settings);
    app.local["serverUrl"] = "https://untrusted.test";
    await app.context.run(1, "Make this dark");
    expect(app.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    const [url, init] = app.upstream.mock.calls[1]!;
    expect(url).toBe("http://127.0.0.1:5173/api/public/reshape");
    expect(init.headers.Authorization).toBe("Bearer test-account-token");
    expect(JSON.parse(init.body)).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-5-5",
    });
    expect(JSON.stringify(app.session)).not.toContain("test-account-token");
    expect(app.session["last:1"]).toMatchObject({ status: "done" });
  });
  it("requires sign-in and rejects an older server before sending page content", async () => {
    const app = background(settings);
    delete app.local["account"];
    await app.context.run(1, "Make this dark");
    expect(app.upstream).not.toHaveBeenCalled();
    const old = background(settings);
    old.upstream.mockReset().mockResolvedValue(new Response("Not found", { status: 404 }));
    await old.context.run(1, "Make this dark");
    expect(old.upstream).toHaveBeenCalledTimes(1);
    expect(old.executeScript).not.toHaveBeenCalled();
  });
  it("saves a new key only through the encrypted endpoint and remembers metadata locally", async () => {
    const app = background();
    await app.context.saveAISettings({
      provider: "anthropic",
      model: "claude-opus-5-5",
      apiKey: "test-private-key",
      serverUrl: "https://untrusted.test",
    });
    expect(app.upstream.mock.calls[0]![0]).toBe("http://127.0.0.1:5173/api/public/credentials");
    expect(app.local["aiSettings"]).toEqual(settings);
    expect(JSON.stringify(app.local)).not.toContain("test-private-key");
  });
  it("migrates an old device-only key after an encrypted account save succeeds", async () => {
    const app = background({
      provider: "anthropic",
      model: "claude-opus-5-5",
      apiKey: "legacy-private-key",
    });
    const result = await app.context.getAISettings();
    expect(app.local["aiSettings"]).toEqual(settings);
    expect(JSON.stringify(result)).not.toContain("legacy-private-key");
    expect(JSON.stringify(app.local)).not.toContain("legacy-private-key");
  });
  it("never discards a legacy key when encrypted migration fails", async () => {
    const app = background({ ...settings, apiKey: "legacy-private-key" });
    app.upstream
      .mockReset()
      .mockResolvedValue(Response.json({ error: "Storage unavailable" }, { status: 503 }));
    await expect(app.context.getAISettings()).rejects.toThrow("Storage unavailable");
    expect(app.local["aiSettings"]).toMatchObject({ apiKey: "legacy-private-key" });
  });
  it("does not restore an old account when its refresh completes after an account switch", async () => {
    const app = background(settings);
    app.local["account"] = { accessToken: "old", refreshToken: "old-refresh", expiresAt: 0 };
    let finish: (response: Response) => void = () => {};
    app.upstream.mockReset().mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = app.context.accountToken("http://127.0.0.1:5173");
    await vi.waitFor(() => expect(app.upstream).toHaveBeenCalledTimes(1));
    const next = {
      accessToken: "new-account-token",
      refreshToken: "new-refresh",
      expiresAt: Date.now() / 1000 + 3600,
    };
    app.local["account"] = next;
    finish(
      Response.json({ accessToken: "refreshed-old-token", refreshToken: "rotated-old-refresh" }),
    );
    expect(await pending).toBeNull();
    expect(app.local["account"]).toEqual(next);
  });

  it("lets content scripts read rules but blocks access to account and credential actions", async () => {
    const app = background(settings);
    const reply = vi.fn();
    expect(app.message({ type: "getRules" }, "https://example.com", reply)).toBe(true);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ rules: [] }));
    for (const type of ["getAISettings", "saveAISettings", "accountToken", "run", "setServer"])
      expect(app.message({ type }, "https://example.com", reply)).toBe(false);
    expect(JSON.stringify(reply.mock.calls)).not.toContain("test-account-token");
  });
});
