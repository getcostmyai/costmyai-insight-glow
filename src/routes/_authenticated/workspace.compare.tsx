import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/_authenticated/workspace/compare")({
  component: () => <LevelScreen scope="mine" level="compare" />,
});
