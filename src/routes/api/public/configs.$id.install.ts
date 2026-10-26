import { createFileRoute } from "@tanstack/react-router";

import { recordInstall } from "@/server/configs.server";
import { CORS_HEADERS } from "@/server/reshape.server";

export const Route = createFileRoute("/api/public/configs/$id/install")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: ({ params }) => recordInstall(params.id),
    },
  },
});
