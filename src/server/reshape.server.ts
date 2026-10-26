import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "./ai/run-id.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Lovable-AIG-Run-ID",
  "Access-Control-Max-Age": "86400",
} as const;

const RequestSchema = z.object({
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
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleReshape(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return json({ error: "The AI service is not configured." }, 500);

  let input: z.infer<typeof RequestSchema>;
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Invalid request." }, 400);
    input = parsed.data;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  let upstreamError: unknown = null;
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [
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
    output: Output.object({ schema: PlanSchema }),
    abortSignal: request.signal,
    onError: ({ error }) => {
      upstreamError = error;
    },
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  try {
    const plan = await result.output;
    return json(plan);
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      try {
        const fallback = PlanSchema.parse(JSON.parse(error.text ?? ""));
        return json(fallback);
      } catch {
        return json({ error: "The AI returned an unreadable plan. Try rephrasing." }, 502);
      }
    }
    const err = (upstreamError ?? error) as { statusCode?: number; message?: string };
    const status = err?.statusCode;
    if (status === 402) return json({ error: "AI credits are used up for this workspace." }, 402);
    if (status === 429) return json({ error: "Too many requests right now. Wait a moment and try again." }, 429);
    if (status === 403) return json({ error: err.message ?? "AI access was denied." }, 403);
    console.error("reshape failed", error);
    return json({ error: "The AI request failed. Try again." }, 502);
  }
}
