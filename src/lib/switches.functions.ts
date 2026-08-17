import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { paymentsEnvironment } from "./billing/env.server";
import { requirePlan } from "./billing/guard.server";
import { writeAccountObjective } from "./dashboard/objective-write";
import type { ObjectiveKind } from "./engine/types";

/**
 * Switch lifecycle — the write side of the dashboard.
 *
 * PROJECT RULE (Phase 5 carry-forward): `requirePlan(...)` is the first
 * statement of every handler in this file, before any read, write or branch.
 * Manual switching is the Rightsize level; autonomous switching is Govern;
 * objective selection is Certify. A workspace that is not paying for the level
 * is refused here, server-side, with no promotional bypass of any kind.
 *
 * Identity is a separate gate underneath: the database's SECURITY DEFINER
 * functions re-derive the actor from auth.uid(), require manager role in that
 * workspace, and refuse the synthetic demo org. An org id in a request body can
 * therefore never reach a workspace the caller does not manage.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const OBJECTIVES: ObjectiveKind[] = ["cost", "latency", "quality_floor"];

function plainly(message: string) {
  return new Error(message.replace(/^.*?:\s*/, ""));
}

export interface SwitchResult {
  switchId: string;
  status: "active" | "paused" | "rolled_back";
}

export type OpportunityKind = "host_arbitrage" | "quality_match" | "rightsize";

const KINDS: OpportunityKind[] = ["host_arbitrage", "quality_match", "rightsize"];
const MIN_PLAN: Record<OpportunityKind, string> = {
  host_arbitrage: "compare",
  quality_match: "certify",
  rightsize: "rightsize",
};

/**
 * Activate a switch straight from a dashboard row.
 *
 * The row the browser clicked is only an identifier: the saving, the basis and
 * the destination are re-derived here by re-running the engine over the
 * caller's own traffic, so nothing a client posts can inflate a recommendation.
 * The derived row is persisted through a SECURITY DEFINER upsert (manager-only,
 * demo workspace refused) and then applied by `apply_switch`.
 */
export const activateOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      orgId: string;
      kind: OpportunityKind;
      fromModel: string;
      fromHost: string;
      toModel: string;
      toHost: string;
      taskHint: string;
      autonomous?: boolean;
    }) => {
      if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
      if (!KINDS.includes(data?.kind)) throw new Error("Unknown recommendation");
      const text = (v: unknown) => String(v ?? "").slice(0, 200);
      if (!text(data.fromModel) || !text(data.toModel)) throw new Error("Unknown recommendation");
      return {
        orgId: data.orgId,
        kind: data.kind,
        fromModel: text(data.fromModel),
        fromHost: text(data.fromHost),
        toModel: text(data.toModel),
        toHost: text(data.toHost),
        taskHint: text(data.taskHint),
        autonomous: Boolean(data.autonomous),
      };
    },
  )
  .handler(async ({ data, context }): Promise<SwitchResult> => {
    await requirePlan(
      context.supabase,
      data.orgId,
      data.autonomous ? "govern" : "rightsize",
      paymentsEnvironment(),
    );

    const { buildDashboardSnapshot } = await import("./dashboard.server");
    const snapshot = await buildDashboardSnapshot({
      days: 30,
      orgId: data.orgId,
      client: context.supabase as never,
    });

    const same = (a: string, b: string) => a === b;
    let found:
      | {
          monthlySaving: number;
          savingPct: number;
          basis: string;
          note: string;
          qualityDelta: number | null;
          toModel: string;
          toHost: string;
        }
      | undefined;

    if (data.kind === "rightsize") {
      const o = snapshot.oversized.find(
        (r) =>
          same(r.model, data.fromModel) &&
          same(r.hostKey, data.fromHost) &&
          same(r.task, data.taskHint) &&
          (r.toModel ?? "") === data.toModel,
      );
      if (o) {
        found = {
          monthlySaving: o.wasted,
          savingPct: o.savingPct,
          basis: "right-sized",
          note: o.note,
          qualityDelta: null,
          toModel: o.toModel ?? "",
          // Dispatch 231. The destination host is the one the ENGINE resolved
          // for the recommended model, re-derived here from the snapshot — not
          // the workload's own host, and not whatever the client posted.
          //
          // Pinning to the source host was the defect: `findOversized` ranks
          // the cheapest model at the required tier across every priced host,
          // so the target is often on another provider. Writing it as a
          // same-host swap made `phaseFor` call it Phase 1 and mark it
          // executable, and the container would then have asked the source
          // provider for a model it does not serve. A cross-host right-size is
          // a Phase 2 switch and must be gated as one.
          toHost: o.toHost ?? o.hostKey,
        };
      }
    } else {
      const pool =
        data.kind === "host_arbitrage" ? snapshot.hostArbitrage : snapshot.qualityMatched;
      const o = pool.find(
        (r) =>
          same(r.fromModel, data.fromModel) &&
          same(r.taskHint, data.taskHint) &&
          same(r.toModel, data.toModel),
      );
      if (o) {
        found = {
          monthlySaving: o.monthlySaving,
          savingPct: o.savingPct,
          basis: o.basis,
          note: o.note,
          qualityDelta: o.qualityDelta,
          toModel: o.toModel,
          toHost: o.toHost,
        };
      }
    }

    if (!found || !found.toModel) {
      throw new Error("That recommendation is no longer current. Refresh and try again.");
    }

    const { data: recId, error: recError } = await context.supabase.rpc("upsert_recommendation", {
      _org_id: data.orgId,
      _kind: data.kind,
      _min_plan: MIN_PLAN[data.kind],
      _from_model: data.fromModel,
      _from_host: data.fromHost,
      _to_model: found.toModel,
      _to_host: found.toHost || data.toHost,
      _task_hint: data.taskHint,
      _monthly_saving: found.monthlySaving,
      _saving_pct: found.savingPct,
      _basis: found.basis,
      _note: found.note,
      _quality_delta: found.qualityDelta,
    } as never);
    if (recError) throw plainly(recError.message);

    const { data: switchId, error } = await context.supabase.rpc("apply_switch", {
      _rec_id: recId as string,
      _autonomous: data.autonomous,
    });
    if (error) throw plainly(error.message);
    return { switchId: switchId as string, status: "active" };
  });

/** Rightsize: put a recommended switch live. Govern: let it run autonomously. */
export const activateSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; recommendationId: string; autonomous?: boolean }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (!UUID.test(data?.recommendationId ?? "")) throw new Error("Unknown recommendation");
    return {
      orgId: data.orgId,
      recommendationId: data.recommendationId,
      autonomous: Boolean(data.autonomous),
    };
  })
  .handler(async ({ data, context }): Promise<SwitchResult> => {
    await requirePlan(
      context.supabase,
      data.orgId,
      data.autonomous ? "govern" : "rightsize",
      paymentsEnvironment(),
    );

    const { data: switchId, error } = await context.supabase.rpc("apply_switch", {
      _rec_id: data.recommendationId,
      _autonomous: data.autonomous,
    });
    if (error) throw plainly(error.message);
    return { switchId: switchId as string, status: "active" };
  });

/** Rightsize: stop routing to the cheaper target without giving up the switch. */
export const pauseSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; switchId: string; reason?: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (!UUID.test(data?.switchId ?? "")) throw new Error("Unknown switch");
    return { orgId: data.orgId, switchId: data.switchId, reason: (data.reason ?? "").slice(0, 280) };
  })
  .handler(async ({ data, context }): Promise<SwitchResult> => {
    await requirePlan(context.supabase, data.orgId, "rightsize", paymentsEnvironment());

    const { error } = await context.supabase.rpc("set_switch_state", {
      _switch_id: data.switchId,
      _status: "paused",
      _reason: data.reason || undefined,
    });
    if (error) throw plainly(error.message);
    return { switchId: data.switchId, status: "paused" };
  });

/** Rightsize: put a paused switch back in service. */
export const resumeSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; switchId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (!UUID.test(data?.switchId ?? "")) throw new Error("Unknown switch");
    return { orgId: data.orgId, switchId: data.switchId };
  })
  .handler(async ({ data, context }): Promise<SwitchResult> => {
    await requirePlan(context.supabase, data.orgId, "rightsize", paymentsEnvironment());

    const { error } = await context.supabase.rpc("set_switch_state", {
      _switch_id: data.switchId,
      _status: "active",
      _reason: undefined,
    });
    if (error) throw plainly(error.message);
    return { switchId: data.switchId, status: "active" };
  });

/** Rightsize: send the workload back to its original model, permanently. */
export const rollbackSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; switchId: string; reason?: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (!UUID.test(data?.switchId ?? "")) throw new Error("Unknown switch");
    return { orgId: data.orgId, switchId: data.switchId, reason: (data.reason ?? "").slice(0, 280) };
  })
  .handler(async ({ data, context }): Promise<SwitchResult> => {
    await requirePlan(context.supabase, data.orgId, "rightsize", paymentsEnvironment());

    const { error } = await context.supabase.rpc("set_switch_state", {
      _switch_id: data.switchId,
      _status: "rolled_back",
      _reason: data.reason || undefined,
    });
    if (error) throw plainly(error.message);
    return { switchId: data.switchId, status: "rolled_back" };
  });

/** Certify: what this workspace optimises for (Clause 07). */
export const setObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      orgId: string;
      objective: ObjectiveKind;
      qualityFloorScore?: number | null;
      maxLatencyMs?: number | null;
    }) => {
      if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
      if (!OBJECTIVES.includes(data?.objective)) throw new Error("Unknown objective");
      const floor = data.qualityFloorScore == null ? null : Number(data.qualityFloorScore);
      const latency = data.maxLatencyMs == null ? null : Math.round(Number(data.maxLatencyMs));
      if (floor != null && (!Number.isFinite(floor) || floor < 0 || floor > 100)) {
        throw new Error("A quality floor is a score between 0 and 100.");
      }
      if (latency != null && (!Number.isFinite(latency) || latency < 1 || latency > 600_000)) {
        throw new Error("A latency ceiling is measured in milliseconds.");
      }
      return {
        orgId: data.orgId,
        objective: data.objective,
        qualityFloorScore: data.objective === "quality_floor" ? floor : null,
        maxLatencyMs: data.objective === "latency" ? latency : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await requirePlan(context.supabase, data.orgId, "certify", paymentsEnvironment());

    // Account-wide default: the null workload scope. Per-workload overrides stay
    // more specific and keep winning in the engine's resolver.
    await writeAccountObjective(context.supabase, data.orgId, context.userId, {
      objective: data.objective,
      quality_floor_score: data.qualityFloorScore,
      max_latency_ms: data.maxLatencyMs,
    });


    return { objective: data.objective };
  });

/**
 * Turn autonomous switching on or off for a workspace — the Govern level.
 *
 * Being on the Govern plan is necessary but not sufficient: nothing runs
 * unattended until a manager sets this deliberately. The RLS update policy
 * ("managers update org") is the identity gate underneath the plan gate.
 */
export const setAutonomous = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; enabled: boolean }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (typeof data?.enabled !== "boolean") throw new Error("Autonomous mode is on or off.");
    return { orgId: data.orgId, enabled: data.enabled };
  })
  .handler(async ({ data, context }) => {
    await requirePlan(context.supabase, data.orgId, "govern", paymentsEnvironment());

    const { data: row, error } = await context.supabase
      .from("organizations")
      .update({ autonomous_enabled: data.enabled })
      .eq("id", data.orgId)
      .select("autonomous_enabled")
      .maybeSingle();

    if (error) throw plainly(error.message);
    if (!row) throw new Error("Only a workspace manager can change autonomous mode.");

    return { enabled: Boolean(row.autonomous_enabled) };
  });

