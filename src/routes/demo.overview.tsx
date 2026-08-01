import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";
import { dashboardQuery } from "@/lib/dashboard-queries";

export const Route = createFileRoute("/demo/overview")({
  head: () => ({
    meta: [
      { title: "Demo · Overview — CostMyAI" },
      {
        name: "description",
        content:
          "Where a live AI stack stands across every CostMyAI check: spend, certified switches, and the savings still unclaimed.",
      },
      { property: "og:title", content: "Demo · Overview — CostMyAI" },
      {
        property: "og:description",
        content: "One view across Compare, Certify, Rightsize and Govern on live demo traffic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery("30d")),
  component: () => <LevelScreen scope="demo" level="overview" />,
});
