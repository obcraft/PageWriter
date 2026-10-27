import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { user, save, list, remove } = vi.hoisted(() => ({
  user: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../server/auth.server", () => ({ userFromRequest: user }));
vi.mock("../server/credential-vault.server", async (original) => ({
  ...(await original<typeof import("../server/credential-vault.server")>()),
  saveUserCredential: save,
  listUserCredentials: list,
  removeUserCredential: remove,
}));
import { handleCredentials } from "../server/credentials.server";
const request = (method: string, body?: object, query = "") =>
  new Request("https://test/api/public/credentials" + query, {
    method,
    headers: { Authorization: "Bearer test-session" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  user.mockResolvedValue({ id: "verified-user", username: "test_user" });
  save.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  list.mockResolvedValue([{ provider: "openai", updated_at: "2026-10-26" }]);
});
afterEach(() => vi.clearAllMocks());

describe("private credential API", () => {
  it("requires sign-in for every credential operation", async () => {
    user.mockResolvedValue(null);
    for (const method of ["GET", "POST", "DELETE"])
      expect((await handleCredentials(request(method))).status).toBe(401);
    expect(save).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it("binds saves to the verified user and never returns the submitted key", async () => {
    const response = await handleCredentials(
      request("POST", { provider: "openai", apiKey: "test-private-key", user_id: "forged-user" }),
    );
    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledWith("verified-user", "openai", "test-private-key");
    expect(await response.text()).not.toContain("test-private-key");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("lists metadata only and removes only this user's selected provider", async () => {
    const response = await handleCredentials(request("GET", undefined, "?user_id=forged-user"));
    expect(await response.json()).toEqual({
      user: { id: "verified-user", username: "test_user" },
      credentials: [{ provider: "openai", updated_at: "2026-10-26" }],
    });
    expect(list).toHaveBeenCalledWith("verified-user");
    await handleCredentials(request("DELETE", undefined, "?provider=openai&user_id=forged-user"));
    expect(remove).toHaveBeenCalledWith("verified-user", "openai");
  });
  it("rejects bad providers and whitespace keys", async () => {
    expect(
      (await handleCredentials(request("POST", { provider: "other", apiKey: "test-key" }))).status,
    ).toBe(400);
    expect(
      (await handleCredentials(request("POST", { provider: "openai", apiKey: "bad key" }))).status,
    ).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
