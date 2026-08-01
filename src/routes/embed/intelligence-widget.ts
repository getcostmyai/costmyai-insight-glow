import { createFileRoute } from "@tanstack/react-router";

/**
 * The embeddable widget document (pretty URL used in the copy-paste snippet).
 * Served as an isolated iframe document — never as a script running in the host
 * page's context.
 */
export const Route = createFileRoute("/embed/intelligence-widget")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { serveWidgetDocument } = await import("@/lib/intelligence/widget-serve.server");
        return serveWidgetDocument(request);
      },
    },
  },
});
