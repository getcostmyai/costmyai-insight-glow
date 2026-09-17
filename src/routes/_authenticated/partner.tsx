import { Outlet, createFileRoute, useRouterState, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Handshake, X } from "lucide-react";

import { getMyPartner } from "@/lib/partners.functions";
import { claimPartnerMembership } from "@/lib/partner-application.functions";
import { listMyWorkspaces } from "@/lib/workspace.functions";
import { getDemoAccess } from "@/lib/demo-access.functions";

import { PartnerDataProvider } from "@/components/partner/partner-context";
import { PartnerSidebar, type PartnerNavKey } from "@/components/partner/PartnerSidebar";
import { copyText } from "@/lib/copy-text";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-origin";

/**
 * Layout for the partner area.
 *
 * It owns the one question all three pages would otherwise repeat — is this
 * person part of a partner account at all — plus the self-link attempt and the
 * loading, error and "not a partner" states. Overview, Earnings and Settings
 * are child routes, so someone landing directly on any of them gets exactly
 * the same honest answer as someone landing on /partner.
 */
export const Route = createFileRoute("/_authenticated/partner")({
  component: PartnerLayout,
});

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function activeKey(pathname: string): PartnerNavKey {
  if (pathname.startsWith("/partner/earnings")) return "earnings";
  if (pathname.startsWith("/partner/settings")) return "settings";
  return "overview";
}

export function PartnerLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const partner = useQuery({ queryKey: ["my-partner"], queryFn: () => getMyPartner() });
  // Same key and staleness as WorkspaceLayout, so the two layouts share one
  // answer and one round trip rather than each asking separately.
  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 30_000,
  });
  const hasWorkspace =
    workspaces.isPending || workspaces.isError ? undefined : (workspaces.data?.length ?? 0) > 0;
  // The server decides who may open the demo. Asked here so the sidebar stays
  // presentational, and read strictly: only a known positive shows the link.
  const demoAccess = useQuery({
    queryKey: ["demo-access"],
    queryFn: () => getDemoAccess(),
    staleTime: 30_000,
  });
  const hasDemoAccess =
    demoAccess.isPending || demoAccess.isError ? undefined : demoAccess.data?.audience != null;
  const [claim, setClaim] = useState<"idle" | "running" | "done">("idle");
  // The self-link is attempted exactly once per mount. A ref, not effect
  // dependencies: `partner` is a new object every render, so depending on it
  // re-ran the effect, and its cleanup cancelled the in-flight attempt before
  // it could report back — a visitor who is not a partner sat on "Linking your
  // partner account…" forever instead of being told so.
  const claimed = useRef(false);

  // An approved applicant signs in for the first time with the email they
  // applied with: the account links itself here, once, instead of waiting on a
  // manual database insert.
  useEffect(() => {
    if (partner.isPending || partner.data || claimed.current) return;
    claimed.current = true;
    setClaim("running");
    void claimPartnerMembership()
      .then(async (r) => {
        if (r.partnerId) await partner.refetch();
      })
      .catch(() => undefined)
      .finally(() => setClaim("done"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.isPending, partner.data]);

  if (partner.isPending) return <Shell>Loading your partner account…</Shell>;
  if (partner.isError)
    return <Shell>We could not read your partner account. Try again shortly.</Shell>;
  // Never show "you aren't a partner" while the link is still being checked.
  if (!partner.data && claim !== "done") return <Shell>Linking your partner account…</Shell>;
  if (!partner.data) return <NotAPartner hasWorkspace={hasWorkspace} />;

  return (
    <PartnerDataProvider value={partner.data}>
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-[1440px] gap-8 px-5 py-8 lg:px-8">
          <PartnerSidebar
            partner={partner.data.partner}
            active={activeKey(pathname)}
            hasWorkspace={hasWorkspace}
          />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </PartnerDataProvider>
  );
}

export function ReferralCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<
    "idle" | "link-ok" | "link-fail" | "code-ok" | "code-fail"
  >("idle");
  // The production origin, never window.location.origin: this link is pasted
  // somewhere else, so a preview host copied out of the preview app would be a
  // dead link for whoever receives it.
  const link = `${PUBLIC_SITE_ORIGIN}/r/${code}`;

  function run(which: "link" | "code", text: string) {
    void copyText(text).then((ok) => {
      setCopied(`${which}-${ok ? "ok" : "fail"}` as typeof copied);
      setTimeout(() => setCopied("idle"), 2000);
    });
  }

  const linkLabel =
    copied === "link-ok" ? "Link copied" : copied === "link-fail" ? "Copy failed" : "Copy link";
  const codeLabel =
    copied === "code-ok" ? "Code copied" : copied === "code-fail" ? "Copy failed" : "Copy code only";
  const announcement =
    copied === "idle"
      ? ""
      : copied === "link-ok"
        ? "Link copied"
        : copied === "code-ok"
          ? "Code copied"
          : "Copy failed";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="truncate rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">
        {link}
      </code>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={linkLabel}
          data-copy-state={copied}
          onClick={() => run("link", link)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          {copied === "link-ok" ? (
            <Check className="h-3.5 w-3.5" />
          ) : copied === "link-fail" ? (
            <X className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied === "link-ok" ? "Copied" : copied === "link-fail" ? "Copy failed" : "Copy link"}
        </button>
        <button
          type="button"
          aria-label={codeLabel}
          data-copy-state={copied}
          onClick={() => run("code", code)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
        >
          {copied === "code-fail" ? <X className="h-3.5 w-3.5 text-destructive" /> : null}
          {copied === "code-ok"
            ? "Copied"
            : copied === "code-fail"
              ? "Copy failed"
              : "Copy code only"}
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p> : null}
    </div>
  );
}

function NotAPartner({ hasWorkspace }: { hasWorkspace?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <Handshake className="h-6 w-6 text-primary" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Partner program</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Refer teams to CostMyAI and earn 15–35% of what they pay, for the lifetime of the account
          — the rate rises with referred revenue. You aren't part of a partner account yet.
        </p>
        <a
          href="mailto:mail@costmyai.com?subject=Partner%20program"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Apply to become a partner
        </a>
        {hasWorkspace === true ? (
          <Link
            to="/workspace"
            className="mt-4 block text-xs text-muted-foreground underline hover:text-foreground"
          >
            Back to your workspace
          </Link>
        ) : null}
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </main>
  );
}
