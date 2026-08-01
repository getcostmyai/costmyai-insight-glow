import { createFileRoute } from "@tanstack/react-router";

/**
 * Auth-bypass mirror of `/embed/intelligence-widget`. The `/api/public/*` prefix
 * is guaranteed unauthenticated on every deployment, so an embed on a customer's
 * site keeps working even if the marketing site is ever gated.
 */
export const Route = createFileRoute("/api/public/embed/intelligence-widget")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { serveWidgetDocument } = await import("@/lib/intelligence/widget-serve.server");
        return serveWidgetDocument(request);
      },
    },
  },
});
