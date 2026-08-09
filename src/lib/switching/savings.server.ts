/**
 * Dispatch 155, Stage 6 — `saved_usd`, computed from real rerouted traffic.
 *
 * Until this module existed, `switches.saved_usd` was a number nobody had
 * measured: the only writer in the whole system was a seed migration that
 * back-dated demo rows. The headline figure of the product — "you have
 * captured $X" — was therefore an assertion, not an observation, which is
 * exactly the finding Dispatch 150/151 opened.
 *
 * What is measured here, and nothing else:
 *
 *   saved = cost(original model|host, this event's tokens)
 *         - cost(served   model|host, this event's tokens)
 *
 * summed over the events a container actually rerouted, priced with the same
 * `costOf` and the same `host_prices` rows the rest of the engine uses. There
 * is no rate, no extrapolation and no modelled counterfactual: the token counts
 * are the ones the provider reported for the request that really ran, and the
 * counterfactual price is the price of the pair the caller really asked for.
 *
 * Four rules this file enforces, all of which are ways the number could lie:
 *
 * 1. Errors never save money. A failed rerouted attempt (including the one that
 *    triggers a fallback) is excluded outright.
 * 2. An unpriced pair on either side is excluded and counted, never priced at
 *    zero — pricing a missing side at zero would invent a saving equal to the
 *    full spend of the other side.
 * 3. A negative result is kept. If the destination turned out dearer, the
 *    switch shows a loss and the dashboard says so. Clamping at zero is how a
 *    savings meter becomes a marketing widget.
 * 4. A switch is only ever credited with events from its own workspace, matched
 *    by `route_reason` — a container that names somebody else's switch id
 *    credits nothing, because the query is scoped by `org_id` first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { costOf, round2 } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";
import { fetchAllRows } from "@/lib/paginate.server";

import { buildModelResolver } from "../ingest/resolve";
import { buildHostResolver } from "../ingest/resolve-host";
import { shapeForHost } from "../ingest/provider-shapes";
import { resolveProviderGates } from "../ingest/routing.server";
import {
  decideExecutable,
  phaseFor,
  type SwitchBlockedReason,
} from "../ingest/switch-plan";


type Db = SupabaseClient<Database>;

export interface SwitchSavings {
  switchId: string;
  /** Rerouted, successful events attributed to this switch. */
  events: number;
  /** Events dropped because one side of the comparison has no price. */
  unpricedEvents: number;
  /** What the caller's original pair would have cost for the same tokens. */
  counterfactualUsd: number;
  /** What the pair the container actually used did cost. */
  actualUsd: number;
  /** counterfactual − actual. Signed, deliberately. */
  savedUsd: number;
  /** The pair the traffic moved from / to, as observed. */
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
}

interface EventRow {
  model_key: string;
  host: string;
  original_model_key: string | null;
  original_host: string | null;
  route_reason: string | null;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Read every rerouted, successful event in a workspace and total the observed
 * saving per switch. Pure read — nothing is written here, so this is also what
 * an auditor calls to check the stored figure independently.
 */
export async function computeSwitchSavings(db: Db, orgId: string): Promise<SwitchSavings[]> {
  const events = await fetchAllRows<EventRow>(
    (f, t) =>
      db
        .from("usage_events")
        .select(
          "model_key, host, original_model_key, original_host, route_reason, input_tokens, output_tokens",
        )
        .eq("org_id", orgId)
        .eq("rerouted", true)
        .eq("status", "ok")
        .is("fallback_reason", null)
        .not("route_reason", "is", null)
        .order("occurred_at", { ascending: true })
        .range(f, t),
    { maxPages: 500 },
  );
  if (events.length === 0) return [];

  /**
   * Live, real price rows only. A delisted pair is not a price we would quote
   * anywhere else in the product, so it is not a price we will credit a saving
   * against either — an event priced against a withdrawn row lands in
   * `unpricedEvents` and is visibly excluded rather than quietly valued.
   */
  const priceRows = await fetchAllRows<PriceRow>((f, t) =>
    db
      .from("host_prices")
      .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok")
      .eq("is_fixture", false)
      .eq("is_active", true)
      .range(f, t),
  );

  const priceIndex = new Map<string, PriceRow>(
    priceRows.map((p) => [
      `${p.model_key}|${p.host}`,
      {
        ...p,
        input_usd_per_mtok: Number(p.input_usd_per_mtok),
        output_usd_per_mtok: Number(p.output_usd_per_mtok),
      } as PriceRow,
    ]),
  );

  /**
   * The same resolution the rollups use. Real containers report provider-native
   * names (`gpt-4o-mini`, `api.openai.com`); if savings resolved names any
   * differently from the spend chart, the two figures would be computed over
   * different traffic and could never be reconciled.
   */
  const [catalog, aliases] = await Promise.all([
    fetchAllRows((f, t) => db.from("model_catalog").select("model_key").eq("is_active", true).range(f, t)),
    fetchAllRows((f, t) => db.from("model_aliases").select("alias, model_key").range(f, t)),
  ]);
  const resolveModel = buildModelResolver(
    catalog.map((c) => c.model_key),
    aliases,
  );
  const resolveHost = buildHostResolver(
    priceRows.map((p) => p.host),
    { pricedPairs: new Set(priceIndex.keys()) },
  );

  const priceFor = (rawModel: string, rawHost: string): PriceRow | undefined => {
    const model = resolveModel(rawModel).key;
    const host = resolveHost(rawHost, model).key;
    return priceIndex.get(`${model}|${host}`);
  };

  const acc = new Map<string, SwitchSavings>();
  for (const e of events) {
    const switchId = e.route_reason!;
    const row =
      acc.get(switchId) ??
      ({
        switchId,
        events: 0,
        unpricedEvents: 0,
        counterfactualUsd: 0,
        actualUsd: 0,
        savedUsd: 0,
        fromModel: e.original_model_key ?? "",
        fromHost: e.original_host ?? "",
        toModel: e.model_key,
        toHost: e.host,
      } satisfies SwitchSavings);

    const before = e.original_model_key && e.original_host ? priceFor(e.original_model_key, e.original_host) : undefined;
    const after = priceFor(e.model_key, e.host);
    if (!before || !after) {
      row.unpricedEvents += 1;
      acc.set(switchId, row);
      continue;
    }

    row.events += 1;
    row.counterfactualUsd += costOf(before, e.input_tokens, e.output_tokens);
    row.actualUsd += costOf(after, e.input_tokens, e.output_tokens);
    acc.set(switchId, row);
  }

  return [...acc.values()].map((r) => ({
    ...r,
    counterfactualUsd: round2(r.counterfactualUsd),
    actualUsd: round2(r.actualUsd),
    savedUsd: round2(r.counterfactualUsd - r.actualUsd),
  }));
}

export interface SavingsWriteResult extends SwitchSavings {
  /** What the row held before this write. */
  previousUsd: number;
  /** Read back from the row after the write, never assumed. */
  storedUsd: number;
  /**
   * Dispatch 161. True when the server refused to credit the observed money
   * because the switch is not executable under its own current gate.
   */
  refused: boolean;
  /** Present whenever `refused`. Never free text. */
  refusedReason?: SwitchBlockedReason | "switch_not_active";
}

/**
 * Recompute and store `saved_usd` for the switches named by real traffic.
 *
 * Dispatch 161 — the server no longer takes a container at its word. A
 * container reports `rerouted: true` and names a switch; that claim is
 * re-checked here against the switch's own gate state, resolved by the same
 * `phaseFor` / `decideExecutable` that built the plan the container polls. A
 * switch that is not executable today cannot have moved traffic today, so its
 * observed "saving" is not credited: the row is forced to zero, the refusal is
 * written to `switch_events` so it is visible rather than silently dropped,
 * and the result carries `refused: true`.
 *
 * Every write is read back (Dispatch 93: a PostgREST write that matched no row
 * returns success). A switch id a container invented matches nothing under this
 * workspace and is skipped rather than created.
 */
export async function recomputeSwitchSavings(
  db: Db,
  orgId: string,
  only?: string[],
): Promise<SavingsWriteResult[]> {
  const wanted = only && only.length > 0 ? new Set(only) : null;
  const computed = (await computeSwitchSavings(db, orgId)).filter(
    (s) => !wanted || wanted.has(s.switchId),
  );
  const written: SavingsWriteResult[] = [];
  if (computed.length === 0) return written;

  /** The switch rows themselves — the gate is decided from these, not from the report. */
  const { data: switchRows, error: switchErr } = await db
    .from("switches")
    .select("id, from_host, to_host, autonomous, status")
    .eq("org_id", orgId)
    .in(
      "id",
      computed.map((s) => s.switchId),
    );
  if (switchErr) throw new Error(`switch gate unreadable: ${switchErr.message}`);
  const byId = new Map((switchRows ?? []).map((r) => [r.id, r]));
  const gates = await resolveProviderGates(orgId, (switchRows ?? []).map((r) => r.to_host));

  for (const s of computed) {
    const row = byId.get(s.switchId);
    if (!row) continue; // Not this workspace's switch. Nothing is created here.

    const toHost = row.to_host.trim().toLowerCase();
    const gate = gates.get(toHost);
    const phase = phaseFor({
      fromHost: row.from_host.trim().toLowerCase(),
      toHost,
      toShape: shapeForHost(toHost)?.shape ?? null,
    });
    const decision = decideExecutable({
      phase,
      gate: gate?.state ?? "not_connected",
      autonomous: Boolean(row.autonomous),
      everSwitchedTo: gate?.everSwitchedTo ?? false,
    });
    const refusedReason: SwitchBlockedReason | "switch_not_active" | null =
      row.status !== "active"
        ? "switch_not_active"
        : decision.executable
          ? null
          : (decision.reason ?? "routing_not_granted");

    const { data: before } = await db
      .from("switches")
      .select("saved_usd")
      .eq("org_id", orgId)
      .eq("id", s.switchId)
      .maybeSingle();
    if (!before) continue;

    /** Refused: the row is forced to zero, never left holding an uncredited figure. */
    const creditUsd = refusedReason ? 0 : s.savedUsd;

    const { data: after, error } = await db
      .from("switches")
      .update({ saved_usd: creditUsd, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", s.switchId)
      .select("saved_usd")
      .maybeSingle();
    if (error) throw new Error(`saved_usd write failed for ${s.switchId}: ${error.message}`);
    if (!after) throw new Error(`saved_usd write matched no row for ${s.switchId}`);

    if (refusedReason) {
      const { error: eventErr } = await db.from("switch_events").insert({
        org_id: orgId,
        switch_id: s.switchId,
        event: "savings_refused",
        detail:
          `Container reported ${s.events} rerouted event(s) worth $${s.savedUsd.toFixed(2)}, ` +
          `but this switch is not executable today (${refusedReason}). Not credited.`,
      });
      if (eventErr) throw new Error(`savings refusal not recorded for ${s.switchId}: ${eventErr.message}`);
    }

    written.push({
      ...s,
      previousUsd: Number(before.saved_usd),
      storedUsd: Number(after.saved_usd),
      refused: refusedReason !== null,
      ...(refusedReason ? { refusedReason } : {}),
    });
  }

  return written;
}

