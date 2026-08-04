import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/demo/rightsize")({
  head: () => ({
    meta: [
      { title: "Internal workspace — CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Private internal workspace." },
    ],
  }),
  component: () => <LevelScreen scope="demo" level="rightsize" />,
});
