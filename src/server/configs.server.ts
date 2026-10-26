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
  authorName: z.string().trim().max(40).default(""),
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

export async function listConfigs(request: Request) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const db = await admin();
  let query = db
    .from("shared_configs")
    .select("id, host, title, description, author_name, instruction, operations, installs, created_at")
    .order("installs", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (host) {
    const h = normalizeHost(host);
    query = query.in("host", [h, "www." + h, "*"]);
  }
  if (q) {
    const safe = q.replace(/[%_,()]/g, " ");
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,host.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return json({ error: "Couldn't load shared setups." }, 500);
  return json({ configs: data });
}

export async function createConfig(request: Request) {
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
      author_name: c.authorName || "Anonymous",
      instruction: c.instruction,
      operations: c.operations,
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
