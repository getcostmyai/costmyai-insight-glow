import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/demo/govern")({
  head: () => ({
    meta: [
      { title: "Demo System: Govern | CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "A read-only demo applying Financial Governance controls to sample AI spend across providers." },
    ],
  }),
  component: () => <LevelScreen scope="demo" level="govern" />,
});
