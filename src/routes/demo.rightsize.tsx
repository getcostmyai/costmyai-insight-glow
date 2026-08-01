import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";
import { dashboardQuery } from "@/lib/dashboard-queries";

export const Route = createFileRoute("/demo/rightsize")({
  head: () => ({
    meta: [
      { title: "Demo · Rightsize — CostMyAI" },
      {
        name: "description",
        content:
          "Frontier models doing economy-tier work, flagged and switchable in one click. Active savings beside the savings still waiting.",
      },
      { property: "og:title", content: "Demo · Rightsize — CostMyAI" },
      {
        property: "og:description",
        content: "Oversized models detected, priced, and switched by you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery("30d")),
  component: () => <LevelScreen scope="demo" level="rightsize" />,
});
