import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CertifyLevel } from "@/components/dashboard/levels/CertifyLevel";
import { CompareLevel } from "@/components/dashboard/levels/CompareLevel";
import { GovernLevel } from "@/components/dashboard/levels/GovernLevel";
import { OverviewLevel } from "@/components/dashboard/levels/OverviewLevel";
import { RightsizeLevel } from "@/components/dashboard/levels/RightsizeLevel";
import { useDashboardController } from "@/components/dashboard/useDashboardController";
import type { DashboardScope } from "@/lib/dashboard-queries";
import type { LevelKey } from "@/lib/dashboard/levels";

/**
 * One level of the dashboard, for one workspace scope.
 *
 * The route decides which level and which workspace; everything else — the
 * snapshot, the window, the write mutations — is shared, so switching level is
 * a navigation, not a reload of a different product.
 */
export function LevelScreen({ scope, level }: { scope: DashboardScope; level: LevelKey }) {
  const ctl = useDashboardController(scope);

  return (
    <DashboardShell ctl={ctl} level={level}>
      {level === "overview" && <OverviewLevel ctl={ctl} />}
      {level === "compare" && <CompareLevel ctl={ctl} />}
      {level === "certify" && <CertifyLevel ctl={ctl} />}
      {level === "rightsize" && <RightsizeLevel ctl={ctl} />}
      {level === "govern" && <GovernLevel ctl={ctl} />}
    </DashboardShell>
  );
}
