import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";
import { dashboardQuery } from "@/lib/dashboard-queries";

export const Route = createFileRoute("/demo/govern")({
  head: () => ({
    meta: [
      { title: "Demo · Govern — CostMyAI" },
      {
        name: "description",
        content:
          "Certified switches applied unattended as prices and benchmarks move — and the ones deliberately held back for a human.",
      },
      { property: "og:title", content: "Demo · Govern — CostMyAI" },
      {
        property: "og:description",
        content: "Autonomous switching with a gate that refuses what it cannot prove.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery("30d")),
  component: () => <LevelScreen scope="demo" level="govern" />,
});
