import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/demo/compare")({
  head: () => ({
    meta: [
      { title: "Demo System: Compare | CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "A read-only demo comparing sample AI model and host prices, showing where cheaper routing would pay." },
    ],
  }),
  component: () => <LevelScreen scope="demo" level="compare" />,
});
