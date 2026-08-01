import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";
import { dashboardQuery } from "@/lib/dashboard-queries";

export const Route = createFileRoute("/demo/compare")({
  head: () => ({
    meta: [
      { title: "Demo · Compare — CostMyAI" },
      {
        name: "description",
        content:
          "The same model, hosted cheaper elsewhere. Live host arbitrage on a demo AI stack, priced from real published rates.",
      },
      { property: "og:title", content: "Demo · Compare — CostMyAI" },
      {
        property: "og:description",
        content: "Identical model, cheaper host — measured, not estimated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery("30d")),
  component: () => <LevelScreen scope="demo" level="compare" />,
});
