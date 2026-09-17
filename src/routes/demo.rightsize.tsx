import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/demo/rightsize")({
  head: () => ({
    meta: [
      { title: "Demo System: Rightsize | CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "A read-only demo showing sample AI workloads that could run on a smaller model without quality loss." },
    ],
  }),
  component: () => <LevelScreen scope="demo" level="rightsize" />,
});
