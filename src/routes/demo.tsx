import { createFileRoute } from "@tanstack/react-router";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { dashboardQuery } from "@/lib/dashboard-queries";

/**
 * The public demo workspace. This is the dashboard language — dark hero, live
 * synthetic ecosystem — deliberately kept separate from the light marketing
 * pages that link to it.
 */
export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Live demo dashboard — CostMyAI" },
      {
        name: "description",
        content:
          "A live CostMyAI workspace on a real synthetic ecosystem: moving spend and token counts, certified switches, and the money still on the table.",
      },
      { property: "og:title", content: "Live demo dashboard — CostMyAI" },
      {
        property: "og:description",
        content:
          "Watch certified, quality-checked model and host switches cut AI spend on a live workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery("30d")),
  errorComponent: () => (
    <div className="mx-auto max-w-lg p-16 text-center">
      <h1 className="text-xl font-semibold">Usage data is unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We could not read the demo workspace's rollups just now. Refresh in a moment.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg p-16 text-center text-sm text-muted-foreground">
      Workspace not found.
    </div>
  ),
  component: () => <DashboardView scope="demo" />,
});
