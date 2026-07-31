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
 * Manual switching is the Rightsize rung; autonomous switching is Govern;
 * objective selection is Certify. A workspace that is not paying for the rung
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
