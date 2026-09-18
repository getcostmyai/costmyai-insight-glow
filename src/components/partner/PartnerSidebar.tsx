import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Handshake,
  MessageSquarePlus,
  MonitorPlay,
  Settings,
  Wallet,
} from "lucide-react";

import type { PartnerDashboard } from "@/lib/partners.functions";

/**
 * The partner area's own sidebar.
 *
 * Deliberately not DashboardSidebar with a switch on it: a partner has no
 * levels, no plan tier and no locked rungs, so every one of that component's
 * decisions would have to be made irrelevant by a conditional. It matches that
 * sidebar's visual language exactly so the two read as one product.
 */

export type PartnerNavKey = "overview" | "earnings" | "settings";

const nav = [
  { key: "overview" as const, label: "Overview", to: "/partner", icon: Handshake },
  { key: "earnings" as const, label: "Earnings", to: "/partner/earnings", icon: Wallet },
  { key: "settings" as const, label: "Settings", to: "/partner/settings", icon: Settings },
];

const STATUS_TONE: Record<string, string> = {
  active: "bg-primary text-primary-foreground",
  pending: "border border-border text-muted-foreground",
  suspended: "bg-destructive/15 text-destructive",
};

export function PartnerSidebar({
  partner,
  active,
  hasWorkspace,
  hasDemoAccess,
}: {
  partner: PartnerDashboard["partner"];
  active: PartnerNavKey;
  /**
   * A partner account does not imply a workspace. Only true — known, positive —
   * earns the way-out link; pending or failed reads leave it out, because the
   * alternative lands someone on a workspace signup form.
   */
  hasWorkspace?: boolean;
  /**
   * The server's own answer to "may this caller open the demo". Only a known
   * positive renders the link: pending, failed and a null audience all render
   * nothing, so a suspended partnership loses it on the next read.
   */
  hasDemoAccess?: boolean;
}) {
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <div className="sticky top-24 space-y-6">
        <div>
          <p className="text-sm font-semibold">{partner.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${
                STATUS_TONE[partner.status] ?? STATUS_TONE.pending
              }`}
            >
              {partner.status}
            </span>
          </div>
        </div>

        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-primary-soft font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {hasDemoAccess === true || hasWorkspace === true ? (
          <div className="space-y-1 border-t border-border pt-5">
            {hasDemoAccess === true ? (
              <Link
                to="/demo"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MonitorPlay className="size-4" />
                Demo System
              </Link>
            ) : null}
            {hasWorkspace === true ? (
              <Link
                to="/workspace"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back to your workspace
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
