import { afterEach, describe, expect, it, vi } from "vitest";
import { handleReshape } from "../server/reshape.server";

const request = () => new Request("https://pagewright.test/api/public/reshape", {
  method: "POST",
  body: JSON.stringify({ instruction: "make this dark", url: "https://example.com", dom: "body main#feed" }),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenRouter planning", () => {
  it("requires an OpenRouter key and does not call the old provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await handleReshape(request())).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sends strict plans to OpenRouter with Claude Opus 5.5", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only-key");
    const plan = { summary: "Darkened the page", operations: [{ label: "Darkened background", type: "css", selector: null, itemSelector: null, keySelector: null, keyAttribute: null, keyType: null, order: null, property: null, value: "body {background: black}" }] };
    const upstream = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
    vi.stubGlobal("fetch", upstream);
    const result = await handleReshape(request());
    expect(await result.json()).toEqual(plan);
    const [url, init] = upstream.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("anthropic/claude-opus-5.5");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider.require_parameters).toBe(true);
  });

  it("rejects malformed operations instead of executing them", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "done", operations: [{ type: "execute_script" }] }) } }] })));
    expect((await handleReshape(request())).status).toBe(502);
  });
});