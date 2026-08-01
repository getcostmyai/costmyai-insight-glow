import { createFileRoute } from "@tanstack/react-router";

import { LevelScreen } from "@/components/dashboard/LevelScreen";

export const Route = createFileRoute("/_authenticated/workspace/rightsize")({
  component: () => <LevelScreen scope="mine" level="rightsize" />,
});
