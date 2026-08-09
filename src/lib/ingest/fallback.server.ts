import { adminClient } from "./ingest.server";

/**
 * Fallback records and auto-pause (Dispatch 155, Stage 5).
 *
 * A rerouted request that had to fall back to the caller's original model is a
 * failure CostMyAI's own decision caused. One is noise — a destination hiccup,
 * a model briefly unavailable. Several in an hour means the switch itself is
 * wrong for this workspace's traffic, and leaving it live means every affected
 * request pays the latency of two attempts to end up exactly where it started.
 *
 * So the switch is paused, automatically, by us, and the pause is written where
 * the customer already looks: the switch moves into their paused list carrying
 * the reason, with a `switch_events` row behind it and an ops alert on the
 * board. Nothing here is silent, and nothing here is a counter that only
 * increments.
 */

/** How many fallbacks on one switch, inside the window, force a pause. */
export const AUTO_PAUSE_THRESHOLD = 3;

/** The window those fallbacks must fall inside. */
export const AUTO_PAUSE_WINDOW_MINUTES = 60;

/** Event-driven job name for the ops board. */
export const SWITCH_AUTO_PAUSE_JOB = "switch-auto-pause";

export type FallbackReason =
  | "connection_error"
  | "model_not_found"
  | "unsupported_parameter"
  | "destination_4xx";

export interface FallbackReport {
  switch_id: string;
  reason: FallbackReason;
  status_code?: number | null;
  model_key?: string | null;
  host?: string | null;
  occurred_at?: string | null;
  idempotency_key?: string | null;
}

export interface FallbackResult {
  recorded: number;
  /** Switches this call actually moved from active to paused. */
  paused: string[];
}

const REASON_LABEL: Record<FallbackReason, string> = {
  connection_error: "the destination could not be reached",
  model_not_found: "the destination does not know that model",
  unsupported_parameter: "the destination rejected a parameter in the request",
  destination_4xx: "the destination refused the request",
};

/**
 * Record a batch of fallbacks for one workspace and pause any switch that has
 * crossed the threshold. Only switches belonging to `orgId` are ever touched —
 * the switch ids arrive from a container and are re-checked here, never
 * trusted.
 */
export async function recordSwitchFallbacks(
  orgId: string,
  reports: FallbackReport[],
): Promise<FallbackResult> {
  const db = adminClient();

  const { data: owned, error: ownError } = await db
    .from("switches")
    .select("id, status, from_model, to_model, to_host, is_synthetic")
    .eq("org_id", orgId)
    .in("id", [...new Set(reports.map((r) => r.switch_id))]);
  if (ownError) throw new Error(`switch lookup failed: ${ownError.message}`);
  const switches = new Map((owned ?? []).map((s) => [s.id, s]));

  const rows = reports
    .filter((r) => switches.has(r.switch_id))
    .map((r) => ({
      org_id: orgId,
      switch_id: r.switch_id,
      reason: r.reason,
      status_code: r.status_code ?? null,
      model_key: (r.model_key ?? null)?.slice(0, 120) ?? null,
      host: (r.host ?? null)?.slice(0, 120) ?? null,
      occurred_at: r.occurred_at ?? new Date().toISOString(),
      idempotency_key: r.idempotency_key ?? null,
      is_synthetic: switches.get(r.switch_id)?.is_synthetic ?? false,
    }));
  if (rows.length === 0) return { recorded: 0, paused: [] };

  // Dispatch 91: the write is verified, not assumed. A replayed batch collides
  // on the idempotency index and is ignored rather than double-counted.
  const { data: inserted, error } = await db
    .from("switch_fallbacks")
    .upsert(rows, { onConflict: "org_id,idempotency_key", ignoreDuplicates: true })
    .select("id, switch_id");
  if (error) throw new Error(`recording fallbacks failed: ${error.message}`);

  const paused: string[] = [];
  const since = new Date(Date.now() - AUTO_PAUSE_WINDOW_MINUTES * 60_000).toISOString();

  for (const switchId of new Set(rows.map((r) => r.switch_id))) {
    const row = switches.get(switchId);
    if (!row || row.status !== "active") continue;

    const { count, error: countError } = await db
      .from("switch_fallbacks")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("switch_id", switchId)
      .gte("occurred_at", since);
    if (countError) throw new Error(`fallback count failed: ${countError.message}`);
    if ((count ?? 0) < AUTO_PAUSE_THRESHOLD) continue;

    const reason = rows.find((r) => r.switch_id === switchId)?.reason ?? "destination_4xx";
    const detail = `Paused automatically after ${count} fallbacks in ${AUTO_PAUSE_WINDOW_MINUTES} minutes — ${REASON_LABEL[reason as FallbackReason]}. Traffic is back on ${row.from_model}.`;

    // Verified write: the update must actually have moved an active row.
    const { data: updated, error: pauseError } = await db
      .from("switches")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", switchId)
      .eq("org_id", orgId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (pauseError) throw new Error(`auto-pause failed: ${pauseError.message}`);
    if (!updated) continue;

    const { error: eventError } = await db.from("switch_events").insert({
      org_id: orgId,
      switch_id: switchId,
      event: "auto_paused",
      detail,
      actor: null,
      is_synthetic: row.is_synthetic,
    });
    if (eventError) throw new Error(`auto-pause event failed: ${eventError.message}`);

    paused.push(switchId);
    await alertOps(orgId, switchId, count ?? 0, reason as FallbackReason, row.to_model, row.to_host);
  }

  return { recorded: inserted?.length ?? 0, paused };
}

/**
 * Raise the pause on the ops board too. Best-effort by design: an alert that
 * could not be written must never undo a pause that already happened.
 */
async function alertOps(
  orgId: string,
  switchId: string,
  count: number,
  reason: FallbackReason,
  toModel: string,
  toHost: string,
): Promise<void> {
  try {
    const { recordRun } = await import("@/lib/engine/evaluate.server");
    await recordRun({
      job: SWITCH_AUTO_PAUSE_JOB,
      started: new Date(),
      outcome: "ok",
      rowsWritten: 1,
      detail: {
        orgId,
        switchId,
        reason,
        fallbacks: count,
        target: `${toModel}@${toHost}`,
        windowMinutes: AUTO_PAUSE_WINDOW_MINUTES,
        ...(process.env["VITEST"] === "true" || process.env["COSTMYAI_TEST_RUN"] === "1"
          ? { testRun: true }
          : {}),
      },
    });
  } catch (err) {
    console.error("switch auto-pause alert failed", err instanceof Error ? err.message : err);
  }
}
