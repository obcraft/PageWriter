import { createFileRoute } from "@tanstack/react-router";

import { CORS_HEADERS, handleReshape, reshapeCapabilities } from "@/server/reshape.server";

// Called by the Pagewright browser extension from any website.
export const Route = createFileRoute("/api/public/reshape")({
  server: {
    handlers: {
      GET: () => reshapeCapabilities(),
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: ({ request }) => handleReshape(request),
    },
  },
});
