import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleReshape, reshapeCapabilities } from "../server/reshape.server";
import { VaultError } from "../server/credential-vault.server";
const { accountUser, storedKey } = vi.hoisted(() => ({ accountUser: vi.fn(), storedKey: vi.fn() }));
vi.mock("../server/auth.server", () => ({ userFromRequest: accountUser }));
vi.mock("../server/credential-vault.server", async (original) => ({
  ...(await original<typeof import("../server/credential-vault.server")>()),
  getUserCredential: storedKey,
}));
beforeEach(() => {
  accountUser.mockImplementation(async (request: Request) =>
    request.headers.has("Authorization") ? { id: "account-id", username: "test_user" } : null,
  );
  storedKey.mockResolvedValue("test-only-key");
});

const plan = {
  summary: "Darkened the page",
  operations: [
    {
      label: "Darkened background",
      type: "css",
      selector: null,
      itemSelector: null,
      keySelector: null,
      keyAttribute: null,
      keyType: null,
      order: null,
      property: null,
      value: "body {background: black}",
    },
  ],
};
const request = (provider = "openrouter", key = "test-only-key", extra = {}) =>
  new Request("https://pagewright.test/api/public/reshape", {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    body: JSON.stringify({
      provider,
      instruction: "make this dark",
      url: "https://example.com",
      dom: "body main#feed",
      ...extra,
    }),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("encrypted account-key planning", () => {
  it("advertises supported providers without a key or any paid AI request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(await reshapeCapabilities().json()).toEqual({
      authentication: "account-key",
      providers: ["openrouter", "openai", "anthropic"],
      version: 2,
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it("requires sign-in even when the server has a shared provider key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "server-key-must-not-be-used");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await handleReshape(request("openrouter", ""));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ requiresSetup: true });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("does not call a provider when the account has no saved key", async () => {
    storedKey.mockRejectedValueOnce(new VaultError("Add a saved key.", 409));
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await handleReshape(request())).status).toBe(409);
    expect(upstream).not.toHaveBeenCalled();
    expect(storedKey).toHaveBeenCalledWith("account-id", "openrouter");
  });

  it.each([
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions", "anthropic/claude-opus-5.5"],
    ["openai", "https://api.openai.com/v1/chat/completions", "gpt-4.1-mini"],
    ["anthropic", "https://api.anthropic.com/v1/messages", "claude-opus-5-5"],
  ])(
    "uses only the selected %s provider and validates its JSON plan",
    async (provider, url, model) => {
      const result =
        provider === "anthropic"
          ? { content: [{ type: "text", text: JSON.stringify(plan) }], stop_reason: "end_turn" }
          : { choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: "stop" }] };
      const upstream = vi.fn().mockResolvedValue(Response.json(result));
      vi.stubGlobal("fetch", upstream);
      const response = await handleReshape(request(provider));
      expect(await response.json()).toEqual(plan);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(upstream).toHaveBeenCalledTimes(1);
      const [actualURL, init] = upstream.mock.calls[0]!;
      expect(actualURL).toBe(url);
      expect(init.redirect).toBe("error");
      const body = JSON.parse(init.body);
      expect(body.model).toBe(model);
      expect(body).not.toHaveProperty("apiKey");
      if (provider === "anthropic") {
        expect(init.headers["x-api-key"]).toBe("test-only-key");
        expect(init.headers["anthropic-version"]).toBe("2023-06-01");
        expect(init.headers).not.toHaveProperty("Authorization");
        expect(body.output_config.format.type).toBe("json_schema");
        expect(body.output_config.format.schema.additionalProperties).toBe(false);
        expect(body.system).toContain("DOM operations");
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0].role).toBe("user");
      } else {
        expect(init.headers.Authorization).toBe("Bearer test-only-key");
        expect(body.response_format.json_schema.strict).toBe(true);
        if (provider === "openrouter") expect(body.provider.require_parameters).toBe(true);
        else expect(body).not.toHaveProperty("provider");
      }
    },
  );

  it("uses an explicitly selected model", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] }),
      );
    vi.stubGlobal("fetch", upstream);
    await handleReshape(request("openai", "test-only-key", { model: "gpt-4.1" }));
    expect(JSON.parse(upstream.mock.calls[0]![1].body).model).toBe("gpt-4.1");
  });

  it("rejects unknown providers without contacting any upstream", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await handleReshape(request("https://untrusted.test"))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["openrouter", "openai", "anthropic"])(
    "rejects invalid %s operations instead of executing them",
    async (provider) => {
      const text = JSON.stringify({ summary: "done", operations: [{ type: "execute_script" }] });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              provider === "anthropic"
                ? { content: [{ type: "text", text }], stop_reason: "end_turn" }
                : { choices: [{ message: { content: text } }] },
            ),
          ),
      );
      expect((await handleReshape(request(provider))).status).toBe(502);
    },
  );

  it("reopens setup for rejected keys without falling back or echoing upstream content", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = vi
      .fn()
      .mockResolvedValue(new Response("test-only-key and private page content", { status: 401 }));
    vi.stubGlobal("fetch", upstream);
    const response = await handleReshape(request("anthropic"));
    expect(response.status).toBe(401);
    const result = await response.json();
    expect(result.requiresSetup).toBe(true);
    expect(result.error).toContain("Anthropic");
    expect(JSON.stringify(result)).not.toContain("test-only-key");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects truncated Anthropic output even when its text is valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          content: [{ type: "text", text: JSON.stringify(plan) }],
          stop_reason: "max_tokens",
        }),
      ),
    );
    expect((await handleReshape(request("anthropic"))).status).toBe(502);
  });
});
