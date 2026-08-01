import { createFileRoute } from "@tanstack/react-router";

/**
 * Public embed data endpoint.
 *
 * Unauthenticated market figures for the widget, behind their own rate limit and
 * their own server-side cache so embed traffic can never reach the dashboard's
 * infrastructure budget.
 */
export const Route = createFileRoute("/api/public/widget/intelligence")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { widgetPreflight } = await import("@/lib/intelligence/widget-serve.server");
        return widgetPreflight();
      },
      GET: async ({ request }) => {
        const { serveWidgetData } = await import("@/lib/intelligence/widget-serve.server");
        return serveWidgetData(request);
      },
    },
  },
});
