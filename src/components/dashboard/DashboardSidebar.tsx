import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  CreditCard,
  Gauge,
  Layers,
  LineChart,
  Lock,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import type { DashboardScope } from "@/lib/dashboard-queries";
import type { LevelKey } from "@/lib/dashboard/levels";
import { LEVELS } from "@/lib/dashboard/levels";
import { planAtLeast, type PlanTier } from "@/lib/engine/types";

/**
 * The one sidebar the whole signed-in product shares.
 *
 * It lives apart from the dashboard shell because Settings, Billing and Team
 * are part of the same product surface: dropping the level nav on those pages
 * left no way back into the dashboard except the browser's Back button.
 */

export type AccountKey = "settings" | "billing" | "team";

export const ICONS: Record<LevelKey, typeof Layers> = {
  overview: Layers,
  compare: LineChart,
  certify: BadgeCheck,
  rightsize: Gauge,
  govern: ShieldCheck,
};

const accountNav = [
  { key: "settings" as const, label: "Settings", to: "/settings", icon: Settings },
  { key: "billing" as const, label: "Billing", to: "/billing", icon: CreditCard },
  { key: "team" as const, label: "Team", to: "/team", icon: Users },
];

/** Literal paths so the router type-checks every destination. */
export const PATHS = {
  demo: {
    overview: "/demo/overview",
    compare: "/demo/compare",
    certify: "/demo/certify",
    rightsize: "/demo/rightsize",
    govern: "/demo/govern",
  },
  mine: {
    overview: "/workspace",
    compare: "/workspace/compare",
    certify: "/workspace/certify",
    rightsize: "/workspace/rightsize",
    govern: "/workspace/govern",
  },
} as const;

export function DashboardSidebar({
  workspaceName,
  plan,
  level,
  scope,
  account,
}: {
  workspaceName: string;
  plan: PlanTier;
  /** The level being viewed, or null on an account page. */
  level: LevelKey | null;
  scope: DashboardScope;
  account?: AccountKey;
}) {
  const paths = PATHS[scope];
  // The demo walks the whole product, so it lists every level. A real
  // workspace sees the level it pays for and the ones above it — the nav is an
  // upsell path, never a way back down.
  const visibleLevels =
    scope === "demo"
      ? LEVELS
      : LEVELS.filter(
          (meta) =>
            meta.requiredPlan === null ||
            meta.key === level ||
            planAtLeast(meta.requiredPlan, plan),
        );

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <div className="sticky top-24 space-y-6">
        <div>
          <p className="text-sm font-semibold">{workspaceName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold tracking-widest text-primary-foreground uppercase">
              {level
                ? (LEVELS.find((l) => l.key === level)?.label ?? level)
                : (accountNav.find((a) => a.key === account)?.label ?? "Account")}
            </span>
            <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              {plan} plan
            </span>
          </div>
        </div>

        <nav className="space-y-1">
          {visibleLevels.map((meta) => {
            const Icon = ICONS[meta.key];
            const active = meta.key === level;
            const locked =
              scope === "mine" &&
              meta.requiredPlan !== null &&
              !planAtLeast(plan, meta.requiredPlan);
            return (
              <Link
                key={meta.key}
                to={paths[meta.key]}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-primary-soft font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {meta.label}
                {locked ? <Lock className="ml-auto size-3.5 opacity-60" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border pt-5">
          <p className="eyebrow px-3 pb-1">Account</p>
          {accountNav.map((item) => {
            const Icon = item.icon;
            const active = item.key === account;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary-soft font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
