import { createFileRoute } from "@tanstack/react-router";

import { toggleLike } from "@/server/configs.server";
import { CORS_HEADERS } from "@/server/reshape.server";

// Toggle the signed-in user's like on a shared setup.
export const Route = createFileRoute("/api/public/configs/$id/like")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: ({ request, params }) => toggleLike(request, params.id),
    },
  },
});
