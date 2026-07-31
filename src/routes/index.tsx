import { createFileRoute } from "@tanstack/react-router";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { dashboardQuery } from "@/lib/dashboard-queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rightsize Dashboard — CostMyAI" },
      {
        name: "description",
        content:
          "See what your AI gateway really costs, which certified switches are saving money today, and how much is still on the table.",
      },
      { property: "og:title", content: "Rightsize Dashboard — CostMyAI" },
      {
        property: "og:description",
        content:
          "Certified, quality-checked model and host switches that cut AI spend without touching output quality.",
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
        We could not read your gateway rollups just now. Refresh in a moment.
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
