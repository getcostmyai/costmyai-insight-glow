import { createFileRoute, Outlet } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";

/** Blog layout: marketing chrome once, article or index inside it. */
export const Route = createFileRoute("/blog")({
  component: () => (
    <MarketingShell>
      <Outlet />
    </MarketingShell>
  ),
});
