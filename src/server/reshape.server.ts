import { z } from "zod/v4";
import { userFromRequest } from "./auth.server";
import { getUserCredential, VaultError } from "./credential-vault.server";
import { CORS_HEADERS } from "./public-http.server";
export { CORS_HEADERS } from "./public-http.server";

const PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-opus-5.5",
  },
  openai: {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini",
  },
  anthropic: {
    name: "Anthropic",
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-opus-5-5",
  },
} as const;

const RequestSchema = z.object({
  provider: z.enum(["openrouter", "openai", "anthropic"]),
  model: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._:/-]+$/)
    .optional(),
  instruction: z.string().trim().min(1).max(2000),
  url: z.string().max(2000),
  title: z.string().max(500).default(""),
  dom: z.string().min(1).max(200_000),
  target: z
    .object({
      selector: z.string().max(1000),
      label: z.string().max(300).default(""),
      outline: z.string().max(8000).default(""),
      parent: z.string().max(1000).nullable().default(null),
    })
    .nullable()
    .optional(),
});

const OP_TYPES = [
  "sort",
  "filter",
  "hide",
  "show",
  "remove",
  "style",
  "text",
  "attribute",
  "click",
  "css",
  "move",
  "insert",
] as const;

// Strict-compatible schema: every field required, optional values nullable.
const OperationSchema = z.object({
  label: z.string(),
  type: z.enum(OP_TYPES),
  selector: z.string().nullable(),
  itemSelector: z.string().nullable(),
  keySelector: z.string().nullable(),
  keyAttribute: z.string().nullable(),
  keyType: z.enum(["date", "number", "text"]).nullable(),
  order: z.enum(["asc", "desc"]).nullable(),
  property: z.string().nullable(),
  value: z.string().nullable(),
});

const PlanSchema = z.object({
  summary: z.string(),
  operations: z.array(OperationSchema),
});

export type ReshapePlan = z.infer<typeof PlanSchema>;

const INSTRUCTIONS = `You are Pagewright, a browser extension brain. The user is looking at a web page and asks you to change it LOCALLY (only in their browser). You receive a compact outline of the page's DOM and must return a list of DOM operations that a script will execute.

DOM outline format: one element per line, indented by depth: tag#id.class1.class2 [attr="value"] "direct text". Plain wrapper elements may be omitted, so NEVER use the ">" child combinator or :nth-child based on outline positions. Lines like "… 14 more <li.item> siblings" mean there are more elements of the same shape.

Every operation has a label: a very short plain-language description of the step for a non-technical user, in the user's language (e.g. "Darkened the background", "Moved search bar to the bottom").

Operations (unused fields must be null):
- sort: reorder repeated items. selector = CSS selector of the container holding the items (a common ancestor). itemSelector = selector matching every item inside the container. keySelector = selector INSIDE each item for the element holding the sort value (null = the item itself). keyAttribute = attribute to read (e.g. "datetime", "data-time", "aria-label") or null to read visible text. keyType = "date" | "number" | "text". order = "asc" | "desc". Dates can be absolute or relative ("3h", "2d", "1w", "2 mo", "5 days ago", Dutch "3 u", "2 d", "1 w", "2 mnd", "1 j", "gisteren") — the executor parses them. For "chronological"/"newest first"/"recent" feeds use keyType "date" and order "desc" (newest first) unless the user explicitly asks for oldest first, then "asc".
- filter: selector = items selector; value = keywords separated by "|"; property = "keep" (hide items NOT containing any keyword) or "hide" (hide items containing any keyword). Case-insensitive.
- hide / show / remove: selector = elements to affect.
- style: selector, property = CSS property (e.g. "font-size"), value.
- text: selector, value = new text content.
- attribute: selector, property = attribute name, value.
- click: selector = the single element to click (e.g. a native "Sort by: Recent" control). Use only if the page offers a real control for what the user wants AND the change cannot be achieved reliably by DOM edits; prefer sort.
- css: value = a full CSS stylesheet to inject (use for broad visual changes like dark mode, wider layout, bigger fonts, fixed/sticky positioning, hiding via selectors, reflowing layouts with flex/grid "order"). For dark mode write a thorough stylesheet: dark background and light text on html, body and main containers, readable links, inputs/buttons restyled, and e.g. "img, video, picture, svg image { filter: none }"; prefer overriding background-color/color with !important on common containers over a single invert filter, unless the site is very complex — then "html { filter: invert(1) hue-rotate(180deg); background:#fff } img, video, picture, canvas, [style*=background-image] { filter: invert(1) hue-rotate(180deg) }" is an acceptable fallback.
- move: relocate existing element(s). selector = element(s) to move, value = CSS selector of the target anchor element, property = "before" | "after" | "prepend" | "append" (relative to the target). E.g. "move the search bar to the bottom" → selector = the search form/container, value = "body" (or the main footer), property = "append". If moving inside the DOM would break the site's layout, a css op with position:fixed/bottom:0 is a valid alternative.
- insert: add new content. selector = anchor element, value = HTML snippet (static markup with inline styles only; scripts and event handlers are stripped), property = "before" | "after" | "prepend" | "append".

Rules:
- Prefer stable selectors: ids, data-* attributes, semantic tags, aria attributes, and meaningful class names. Avoid long auto-generated hashed classes when a stabler hook exists.
- Selectors must match elements that appear in the outline.
- The user may ask for ANY visual or structural change: restyle, recolor, dark mode, resize, relocate, reorder, hide, rename, add notes or banners, simplify, declutter, change fonts, etc. Always try to fulfil it by combining operations; only return an empty list if it is truly impossible (e.g. needs server data the page does not have).
- Keep the plan focused: usually 1–5 operations.
- summary: one short sentence in the user's language describing what you changed (or why you could not). If the request cannot be done on this page, return an empty operations array and explain in summary.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}

export function reshapeCapabilities(): Response {
  return json({ authentication: "account-key", providers: Object.keys(PROVIDERS), version: 2 });
}

export async function handleReshape(request: Request): Promise<Response> {
  let input: z.infer<typeof RequestSchema>;
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Invalid request." }, 400);
    input = parsed.data;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  // Resolve the verified account; plaintext provider keys never return to clients.
  let apiKey: string;
  try {
    const user = await userFromRequest(request);
    if (!user)
      return json(
        { error: "Sign in to use your saved API key.", requiresSignIn: true, requiresSetup: true },
        401,
      );
    apiKey = await getUserCredential(user.id, input.provider);
  } catch (error) {
    return json(
      {
        error: error instanceof VaultError ? error.message : "Couldn't access your saved API key.",
        requiresSetup: true,
      },
      error instanceof VaultError ? error.status : 503,
    );
  }
  const provider = PROVIDERS[input.provider];

  const body = {
    model: input.model ?? provider.model,
    messages: [
      { role: "system", content: INSTRUCTIONS },
      {
        role: "user",
        content:
          `Page URL: ${input.url}\nPage title: ${input.title}\n\nUser request: ${input.instruction}\n\n` +
          (input.target
            ? `The user POINTED AT this element on the page, so words like "this", "it", "here" refer to it and the request most likely targets it (or items like it):\nSelector: ${input.target.selector}\nDescription: ${input.target.label}\nParent selector: ${input.target.parent ?? "none"}\nIts outline:\n${input.target.outline}\n\n`
            : "") +
          `DOM outline:\n${input.dom}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "pagewright_plan",
        strict: true,
        schema: z.toJSONSchema(PlanSchema),
      },
    },
    max_tokens: 8000,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let upstreamBody: unknown;
  if (input.provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    upstreamBody = {
      model: body.model,
      system: INSTRUCTIONS,
      messages: [body.messages[1]],
      max_tokens: body.max_tokens,
      output_config: {
        format: { type: "json_schema", schema: body.response_format.json_schema.schema },
      },
    };
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
    upstreamBody =
      input.provider === "openrouter" ? { ...body, provider: { require_parameters: true } } : body;
    if (input.provider === "openrouter") headers["X-OpenRouter-Title"] = "Pagewright";
  }

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
      signal: request.signal,
      redirect: "error",
    });
    if (!response.ok) {
      // Do not echo upstream bodies: they can contain submitted page content.
      console.error("AI provider request failed", input.provider, response.status);
      const message =
        response.status === 402
          ? `Your ${provider.name} balance is empty. Add credits to your account.`
          : response.status === 401
            ? `Your ${provider.name} API key is invalid. Update it in Settings to continue.`
            : response.status === 429
              ? `${provider.name} is busy or your usage limit was reached. Check your account or try again later.`
              : `${provider.name} could not complete the request. Check your model and account access in Settings.`;
      return json(
        { error: message, requiresSetup: response.status === 401 },
        [401, 402, 403, 429].includes(response.status) ? response.status : 502,
      );
    }
    const result = (await response.json()) as {
      choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[];
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };
    try {
      const text =
        input.provider === "anthropic"
          ? result.stop_reason === "end_turn" &&
            result.content
              ?.filter((block) => block.type === "text")
              .map((block) => block.text ?? "")
              .join("")
          : result.choices?.[0]?.finish_reason !== "length" &&
            !result.choices?.[0]?.message?.refusal &&
            result.choices?.[0]?.message?.content;
      if (!text) throw new Error("Missing or incomplete plan");
      return json(PlanSchema.parse(JSON.parse(text)));
    } catch {
      return json({ error: "The AI returned an unreadable plan. Try rephrasing." }, 502);
    }
  } catch {
    console.error("AI provider request could not complete", input.provider);
    return json({ error: "The AI request failed. Try again." }, 502);
  }
}
