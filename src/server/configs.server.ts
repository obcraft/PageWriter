import { z } from "zod";

import { CORS_HEADERS } from "./reshape.server";

const OperationSchema = z
  .object({
    type: z.string().max(30),
    label: z.string().max(200).nullable().optional(),
  })
  .passthrough();

const CreateSchema = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^(\*|[a-z0-9.-]+)$/),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  instruction: z.string().trim().min(1).max(2000),
  operations: z.array(OperationSchema).min(1).max(30),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const SORTS = {
  popular: ["likes", "installs", "created_at"],
  newest: ["created_at"],
  tried: ["installs", "likes", "created_at"],
  title: ["title"],
} as const;

export async function listConfigs(request: Request) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const sortKey = (url.searchParams.get("sort") ?? "popular") as keyof typeof SORTS;
  const sort = SORTS[sortKey] ?? SORTS.popular;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 60, 100);
  const db = await admin();
  let query = db
    .from("shared_configs")
    .select("id, host, title, description, author_name, instruction, operations, installs, likes, created_at");
  for (const col of sort) query = query.order(col, { ascending: col === "title" });
  query = query.limit(limit);
  if (host) {
    const h = normalizeHost(host);
    query = query.or(`host.eq.*,host.ilike.%${h.replace(/[%_,()*]/g, "")}%`);
  }
  if (q) {
    const safe = q.replace(/[%_,()*]/g, " ");
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,host.ilike.%${safe}%,author_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return json({ error: "Couldn't load shared setups." }, 500);

  // Mark which ones the signed-in caller has liked.
  let liked = new Set<string>();
  const { userFromRequest } = await import("./auth.server");
  const user = await userFromRequest(request);
  if (user && data.length) {
    const { data: rows } = await db
      .from("config_likes")
      .select("config_id")
      .eq("user_id", user.id)
      .in("config_id", data.map((d) => d.id));
    liked = new Set((rows ?? []).map((r) => r.config_id));
  }
  return json({ configs: data.map((d) => ({ ...d, liked: liked.has(d.id) })) });
}

export async function toggleLike(request: Request, id: string) {
  if (!z.string().uuid().safeParse(id).success) return json({ error: "Not found" }, 404);
  const { userFromRequest } = await import("./auth.server");
  const user = await userFromRequest(request);
  if (!user) return json({ error: "Sign in to like setups." }, 401);
  const db = await admin();
  const { data: existing } = await db
    .from("config_likes")
    .select("config_id")
    .eq("config_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) await db.from("config_likes").delete().eq("config_id", id).eq("user_id", user.id);
  else {
    const { error } = await db.from("config_likes").insert({ config_id: id, user_id: user.id });
    if (error) return json({ error: "Not found" }, 404);
  }
  const { data } = await db.from("shared_configs").select("likes").eq("id", id).maybeSingle();
  return json({ liked: !existing, likes: data?.likes ?? 0 });
}

export async function createConfig(request: Request) {
  const { userFromRequest } = await import("./auth.server");
  const user = await userFromRequest(request);
  if (!user) return json({ error: "Sign in to share a setup." }, 401);
  const raw = await request.text();
  if (raw.length > 100_000) return json({ error: "That setup is too large to share." }, 413);
  let parsed;
  try {
    parsed = CreateSchema.safeParse(JSON.parse(raw));
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!parsed.success) return json({ error: "Give your setup a title (2–80 characters)." }, 400);
  const c = parsed.data;
  const db = await admin();
  const { data, error } = await db
    .from("shared_configs")
    .insert({
      host: c.host === "*" ? "*" : normalizeHost(c.host),
      title: c.title,
      description: c.description,
      author_name: user.username,
      user_id: user.id,
      instruction: c.instruction,
      operations: c.operations as unknown as import("@/integrations/supabase/types").Json,
    })
    .select("id")
    .single();
  if (error) return json({ error: "Couldn't share this setup." }, 500);
  return json({ id: data.id });
}

export async function recordInstall(id: string) {
  if (!z.string().uuid().safeParse(id).success) return json({ error: "Not found" }, 404);
  const db = await admin();
  await db.rpc("increment_installs", { config_id: id });
  return json({ ok: true });
}
