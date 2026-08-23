/**
 * The unrecognised-shape watch (Dispatch 104).
 *
 * The connector parses five response envelopes. That is a claim about the
 * market, and the market changes: a provider ships a sixth shape, or a new
 * provider appears on the pricing feed that nobody has ever inspected. Both
 * are silent failures — the customer's traffic is still forwarded, still
 * accepted, and quietly metered as zero or as an estimate.
 *
 * So both raise a signal on the ledger the team already watches. No new
 * system, no second inbox: `sync_runs` under one job name, judged as an
 * event-driven watch by `judgeJob` and rendered on /admin/jobs beside every
 * scheduled collector.
 */

import { TEST_EMAIL_DOMAINS } from "@/lib/admin/customers";

import { SHAPE_WATCH_JOB } from "./jobs";

export type ShapeWatchSource = "ingest" | "pricing-feed";

export interface ShapeWatchReport {
  source: ShapeWatchSource;
  /** One line, printed as-is on the board. */
  summary: string;
  /** How many distinct things this report covers (events, providers). */
  count: number;
  detail?: unknown;
  /** Whose traffic raised this, when there is a workspace behind it. */
  orgId?: string;
}

/**
 * Test workspaces are named `<something> <Date.now()>`. A real customer is not
 * going to end a workspace name with a 13-digit epoch. Same convention the
 * isolation sweep uses.
 */
const TEST_ORG_NAME = /\s1[0-9]{12}$/;

/**
 * Is this report being raised by the integration suite rather than by real
 * traffic?
 *
 * Dispatch 112. The alerts this watch writes are real rows on the ops board,
 * and the integration suite raises them on purpose — a fixture that declares
 * `cohere` a brand-new provider, an event carrying `no-such-model-at-all`. A
 * board that is permanently red for reasons nobody caused is a board nobody
 * reads, which is the failure mode this watch exists to prevent.
 *
 * Two origins, so two answers, because one mechanism cannot cover both:
 *
 *   1. In-process reports (the pricing feed under a fixture) are stamped from
 *      the environment: Vitest sets VITEST in the process it runs, production
 *      never does.
 *   2. Reports raised over HTTP are written by the app server, which has no
 *      such variable and must never trust a header for this — a public ingest
 *      endpoint that lets the caller mark its own alerts "just a test" is a way
 *      to hide a real one. So the origin is resolved server-side from the
 *      workspace itself: a test-harness contact domain, or the epoch-suffixed
 *      workspace name the suite always creates. Both are facts the caller
 *      cannot assert about itself.
 */
function envAttribution(): boolean {
  return process.env["VITEST"] === "true" || process.env["COSTMYAI_TEST_RUN"] === "1";
}

async function orgAttribution(orgId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, created_by")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return "workspace no longer exists";
    if (TEST_ORG_NAME.test(String(org.name ?? ""))) return "test-harness workspace name";
    if (org.created_by) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", org.created_by)
        .maybeSingle();
      const domain = String(profile?.email ?? "").trim().toLowerCase().split("@")[1] ?? "";
      if ((TEST_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
        return "test-harness contact domain";
      }
    }
    return null;
  } catch {
    // Never let attribution take down the watch: an unattributed alert is
    // noise, an unwritten one is a blind spot.
    return null;
  }
}

/**
 * Record one report. Deliberately best-effort: a watch that could not write
 * its warning must never take down the ingest path it is watching, and the
 * failure is logged where the server logs are read.
 */
export async function reportUnrecognisedShape(report: ShapeWatchReport): Promise<boolean> {
  try {
    const { recordRun } = await import("@/lib/engine/evaluate.server");
    const base =
      report.detail && typeof report.detail === "object" && !Array.isArray(report.detail)
        ? (report.detail as Record<string, unknown>)
        : report.detail === undefined || report.detail === null
          ? {}
          : { detail: report.detail };

    const reason = envAttribution()
      ? "test process"
      : report.orgId
        ? await orgAttribution(report.orgId)
        : null;
    const stamp = reason ? { testRun: true, testReason: reason } : {};

    await recordRun({
      job: SHAPE_WATCH_JOB,
      started: new Date(),
      // `failed` is the alerting state on the board. Nothing here failed to
      // run; something ran and found a shape we cannot account for, which is
      // exactly what the team needs to see coloured red.
      outcome: "failed",
      rowsWritten: report.count,
      error: `[${report.source}] ${report.summary}`,
      detail: { ...base, ...stamp },
    });

    return true;
  } catch (err) {
    console.error("shape watch could not record a report", err);
    return false;
  }
}

