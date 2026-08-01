import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";
import { dashboardQuery } from "@/lib/dashboard-queries";

export const Route = createFileRoute("/demo/certify")({
  head: () => ({
    meta: [
      { title: "Demo · Certify — CostMyAI" },
      {
        name: "description",
        content:
          "A cheaper model only when an independent benchmark proves it holds the same measured quality — including the switches we refuse.",
      },
      { property: "og:title", content: "Demo · Certify — CostMyAI" },
      {
        property: "og:description",
        content: "Different model, proven quality. Refusals shown next to approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery("30d")),
  component: () => <LevelScreen scope="demo" level="certify" />,
});
