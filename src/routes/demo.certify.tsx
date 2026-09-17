import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/demo/certify")({
  head: () => ({
    meta: [
      { title: "Demo System: Certify | CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "A read-only demo certifying savings on sample AI workloads, priced from the cheapest host per model." },
    ],
  }),
  component: () => <LevelScreen scope="demo" level="certify" />,
});
