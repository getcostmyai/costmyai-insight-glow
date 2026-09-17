import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/demo/overview")({
  head: () => ({
    meta: [
      { title: "Demo System: Overview | CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "A read-only demo workspace summarizing sample AI spend and savings, for walkthroughs with prospective customers." },
    ],
  }),
  component: () => <LevelScreen scope="demo" level="overview" />,
});
