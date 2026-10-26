import { createFileRoute } from "@tanstack/react-router";

import { login, refresh, signup } from "@/server/auth.server";
import { CORS_HEADERS } from "@/server/reshape.server";

// Sign-up / sign-in / token refresh for the browser extension.
export const Route = createFileRoute("/api/public/auth/$action")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: ({ request, params }) => {
        if (params.action === "signup") return signup(request);
        if (params.action === "login") return login(request);
        if (params.action === "refresh") return refresh(request);
        return new Response("Not found", { status: 404, headers: CORS_HEADERS });
      },
    },
  },
});
