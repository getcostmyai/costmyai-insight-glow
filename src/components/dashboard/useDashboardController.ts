import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useSessionUser } from "@/hooks/use-session-user";
import {
  dashboardQuery,
  rangeFor,
  type DashboardScope,
  type RangeKey,
} from "@/lib/dashboard-queries";
import type { ChartMetric } from "@/components/dashboard/SpendChart";
import type { ObjectiveKind } from "@/lib/engine/types";
import { useLiveTotals } from "@/lib/gateway-metrics";
import {
  activateOpportunity,
  pauseSwitch,
  resumeSwitch,
  rollbackSwitch,
  setAutonomous as setAutonomousFn,
  setObjective as setObjectiveFn,
  type OpportunityKind,
} from "@/lib/switches.functions";

/**
 * One controller for all five level pages.
 *
 * Every level reads the same snapshot — the engine runs once per request and
 * each level renders its own slice — so the query, the window, the objective
 * and the write mutations live here rather than being re-implemented per page.
 * Keeping it single-source is what stops Compare and Certify quietly
 * disagreeing about the same workspace.
 */
export function useDashboardController(scope: DashboardScope) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [metric, setMetric] = useState<ChartMetric>("spend");
  const [objective, setObjective] = useState<ObjectiveKind>("cost");
  const { data } = useSuspenseQuery(dashboardQuery(range, objective, scope));
  const session = useSessionUser();
  /**
   * One live ticker per page, owned here.
   *
   * Every component that shows spend, requests or tokens reads this object, so
   * the hero and the usage widget can never disagree by a cent — the previous
   * bug was each of them calling useLiveTotals and accruing on its own clock.
   */
  const { live, series: liveSeries } = useLiveTotals(
    range,
    data.series,
    data.totals,
    data.generatedAt,
  );
  const queryClient = useQueryClient();

  /** The demo workspace is read-only by design; only "mine" gets live controls. */
  const canAct = scope === "mine";
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const asMessage = (e: unknown) =>
    e instanceof Error ? e.message : "That action could not be completed.";

  const activate = useMutation({
    mutationFn: (v: {
      key: string;
      kind: OpportunityKind;
      fromModel: string;
      fromHost: string;
      toModel: string;
      toHost: string;
      taskHint: string;
    }) =>
      activateOpportunity({
        data: {
          orgId: data.workspace.id,
          kind: v.kind,
          fromModel: v.fromModel,
          fromHost: v.fromHost,
          toModel: v.toModel,
          toHost: v.toHost,
          taskHint: v.taskHint,
        },
      }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e, v) => setActionError({ key: v.key, message: asMessage(e) }),
  });

  const lifecycle = useMutation({
    mutationFn: (v: { key: string; switchId: string; action: "pause" | "resume" | "rollback" }) => {
      const payload = { data: { orgId: data.workspace.id, switchId: v.switchId } };
      if (v.action === "pause") return pauseSwitch(payload);
      if (v.action === "resume") return resumeSwitch(payload);
      return rollbackSwitch(payload);
    },
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e, v) => setActionError({ key: v.key, message: asMessage(e) }),
  });

  const objectiveMutation = useMutation({
    mutationFn: (v: ObjectiveKind) =>
      setObjectiveFn({ data: { orgId: data.workspace.id, objective: v } }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError({ key: "objective", message: asMessage(e) }),
  });

  const autonomousMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setAutonomousFn({ data: { orgId: data.workspace.id, enabled } }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError({ key: "autonomous", message: asMessage(e) }),
  });

  const chooseObjective = (v: ObjectiveKind) => {
    setObjective(v);
    // On your own workspace the choice is persisted (Certify); on the demo it is
    // a local preview of what that objective would recommend.
    if (canAct) objectiveMutation.mutate(v);
  };

  /** Read-only demo: the row still needs a real destination, not a dead label. */
  const ctaHref = session.signedIn ? "/workspace" : "/auth";
  const ctaLabel = session.signedIn ? "Activate in your workspace" : "Sign in to activate";
  /**
   * Where a discovery level (Compare, Certify) routes the intent to switch.
   * Those levels never execute — Rightsize and Govern do — so their rows link
   * to the level that owns the action instead of offering a dead activate CTA.
   */
  const rightsizeHref = scope === "demo" ? "/demo/rightsize" : "/workspace/rightsize";
  /**
   * The public demo is a showcase, not a console: an action surface renders as
   * a plain label there rather than a button that leads somewhere else.
   */
  const demoReadOnly = scope === "demo";

  const errorFor = (key: string) => (actionError?.key === key ? actionError.message : null);
  const busy = (key: string) =>
    (activate.isPending && activate.variables?.key === key) ||
    (lifecycle.isPending && lifecycle.variables?.key === key);

  return {
    scope,
    data,
    session,
    range,
    setRange,
    activeRange: rangeFor(range),
    metric,
    setMetric,
    live,
    liveSeries,
    objective,
    chooseObjective,
    canAct,
    activate,
    lifecycle,
    autonomousMutation,
    busy,
    errorFor,
    ctaHref,
    ctaLabel,
    rightsizeHref,
    demoReadOnly,
  };
}

export type DashboardController = ReturnType<typeof useDashboardController>;
