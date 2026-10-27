import { createFileRoute } from "@tanstack/react-router";
import { handleCredentials } from "@/server/credentials.server";
import { CORS_HEADERS } from "@/server/public-http.server";

export const Route = createFileRoute("/api/public/credentials")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: ({ request }) => handleCredentials(request),
      POST: ({ request }) => handleCredentials(request),
      DELETE: ({ request }) => handleCredentials(request),
    },
  },
});
