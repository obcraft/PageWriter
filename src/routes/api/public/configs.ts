import { createFileRoute } from "@tanstack/react-router";

import { createConfig, listConfigs } from "@/server/configs.server";
import { CORS_HEADERS } from "@/server/reshape.server";

// Community gallery of shared Pagewright setups, used by the extension's full-screen view.
export const Route = createFileRoute("/api/public/configs")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: ({ request }) => listConfigs(request),
      POST: ({ request }) => createConfig(request),
    },
  },
});
