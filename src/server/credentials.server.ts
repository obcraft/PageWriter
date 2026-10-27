import { z } from "zod/v4";
import { userFromRequest } from "./auth.server";
import {
  listUserCredentials,
  ProviderSchema,
  removeUserCredential,
  saveUserCredential,
  VaultError,
} from "./credential-vault.server";
import { publicJson } from "./public-http.server";

const SaveSchema = z.object({
  provider: ProviderSchema,
  apiKey: z.string().trim().min(1).max(4096).regex(/^\S+$/),
});

export async function handleCredentials(request: Request): Promise<Response> {
  try {
    const user = await userFromRequest(request);
    if (!user)
      return publicJson(
        { error: "Sign in to save and use encrypted API keys.", requiresSignIn: true },
        401,
      );
    if (request.method === "GET")
      return publicJson({
        user: { id: user.id, username: user.username },
        credentials: await listUserCredentials(user.id),
      });
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 6000) return publicJson({ error: "API key is too large." }, 413);
      let input;
      try {
        input = SaveSchema.safeParse(JSON.parse(raw));
      } catch {
        return publicJson({ error: "Invalid request." }, 400);
      }
      if (!input.success)
        return publicJson({ error: "Choose a provider and enter a valid API key." }, 400);
      await saveUserCredential(user.id, input.data.provider, input.data.apiKey);
      return publicJson({ saved: true, provider: input.data.provider, userId: user.id });
    }
    if (request.method === "DELETE") {
      const provider = ProviderSchema.safeParse(new URL(request.url).searchParams.get("provider"));
      if (!provider.success) return publicJson({ error: "Choose a provider." }, 400);
      await removeUserCredential(user.id, provider.data);
      return publicJson({ removed: true, provider: provider.data });
    }
    return publicJson({ error: "Method not allowed." }, 405);
  } catch (error) {
    return publicJson(
      {
        error:
          error instanceof VaultError
            ? error.message
            : "Couldn't access encrypted key storage. Please try again.",
      },
      error instanceof VaultError ? error.status : 503,
    );
  }
}
