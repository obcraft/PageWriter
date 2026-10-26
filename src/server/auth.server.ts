import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { CORS_HEADERS } from "./reshape.server";

// Account endpoints for the browser extension (it has no bundler, so it talks to these instead of the SDK).

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function publicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function usernameFor(userId: string) {
  const db = await admin();
  const { data } = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
  return data?.username ?? null;
}

function sessionBody(session: { access_token: string; refresh_token: string; expires_at?: number }, username: string | null) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    username,
  };
}

const SignupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE),
});

const LoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function signup(request: Request) {
  const parsed = SignupSchema.safeParse(await body(request));
  if (!parsed.success) {
    return json({ error: "Username: 3–20 lowercase letters, numbers or _. Password: at least 8 characters." }, 400);
  }
  const { email, password, username } = parsed.data;
  const db = await admin();
  const { data: taken } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return json({ error: "That username is taken." }, 409);

  const { data, error } = await publicClient().auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) return json({ error: error.message }, 400);
  if (!data.session) return json({ needsConfirmation: true });
  return json(sessionBody(data.session, username));
}

export async function login(request: Request) {
  const parsed = LoginSchema.safeParse(await body(request));
  if (!parsed.success) return json({ error: "Enter your email and password." }, 400);
  const { data, error } = await publicClient().auth.signInWithPassword(parsed.data);
  if (error || !data.session) return json({ error: error?.message ?? "Couldn't sign in." }, 401);
  return json(sessionBody(data.session, await usernameFor(data.user.id)));
}

export async function refresh(request: Request) {
  const b = (await body(request)) as { refreshToken?: unknown } | null;
  if (!b || typeof b.refreshToken !== "string") return json({ error: "Missing token." }, 400);
  const { data, error } = await publicClient().auth.refreshSession({ refresh_token: b.refreshToken });
  if (error || !data.session || !data.user) return json({ error: "Please sign in again." }, 401);
  return json(sessionBody(data.session, await usernameFor(data.user.id)));
}

/** Resolve the signed-in user from an `Authorization: Bearer` header. */
export async function userFromRequest(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await publicClient().auth.getUser(token);
  if (error || !data.user) return null;
  const username = await usernameFor(data.user.id);
  return username ? { id: data.user.id, username } : null;
}
