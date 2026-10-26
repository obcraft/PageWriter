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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Lovable-AIG-Run-ID",
  "Access-Control-Max-Age": "86400",
} as const;

const RequestSchema = z.object({
  instruction: z.string().trim().min(1).max(2000),
  url: z.string().max(2000),
  title: z.string().max(500).default(""),
  dom: z.string().min(1).max(200_000),
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

Operations (unused fields must be null):
- sort: reorder repeated items. selector = CSS selector of the container holding the items (a common ancestor). itemSelector = selector matching every item inside the container. keySelector = selector INSIDE each item for the element holding the sort value (null = the item itself). keyAttribute = attribute to read (e.g. "datetime", "data-time", "aria-label") or null to read visible text. keyType = "date" | "number" | "text". order = "asc" | "desc". Dates can be absolute or relative ("3h", "2d", "1w", "2 mo", "5 days ago", Dutch "3 u", "2 d", "1 w", "2 mnd", "1 j", "gisteren") — the executor parses them. For "chronological"/"newest first"/"recent" feeds use keyType "date" and order "desc" (newest first) unless the user explicitly asks for oldest first, then "asc".
- filter: selector = items selector; value = keywords separated by "|"; property = "keep" (hide items NOT containing any keyword) or "hide" (hide items containing any keyword). Case-insensitive.
- hide / show / remove: selector = elements to affect.
- style: selector, property = CSS property (e.g. "font-size"), value.
- text: selector, value = new text content.
- attribute: selector, property = attribute name, value.
- click: selector = the single element to click (e.g. a native "Sort by: Recent" control). Use only if the page offers a real control for what the user wants AND the change cannot be achieved reliably by DOM edits; prefer sort.
- css: value = a full CSS stylesheet to inject (use for broad visual changes like dark mode, wider layout, bigger fonts).

Rules:
- Prefer stable selectors: ids, data-* attributes, semantic tags, aria attributes, and meaningful class names. Avoid long auto-generated hashed classes when a stabler hook exists.
- Selectors must match elements that appear in the outline.
- Keep the plan minimal: usually 1–3 operations.
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
        content: `Page URL: ${input.url}\nPage title: ${input.title}\n\nUser request: ${input.instruction}\n\nDOM outline:\n${input.dom}`,
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
