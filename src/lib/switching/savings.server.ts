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
import { creditableUsd } from "@/lib/switching/credit";


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
  /**
   * Events a container claimed it rerouted without naming the pair it rerouted
   * FROM. There is no counterfactual for such an event, so it is neither priced
   * nor tolerated: any of these refuses the whole switch's credit for this run.
   * The API schema rejects the shape, but `supabaseAdmin` writes bypass it.
   */
  missingOriginalEvents: number;

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
  /**
   * Dispatch 236. True when no pre-switch history existed for the original
   * pair and the counterfactual had to be priced with the post-switch mix.
   * Marked, never silent: the two are different claims about the same number.
   */
  usedFallbackMix: boolean;
}


/**
 * Dispatch 163. One aggregated row per (switch, served pair, original pair),
 * summed in Postgres. The previous shape read every rerouted event this
 * workspace has ever stored, 1000 at a time, on every ingest — a model whose
 * cost grows with the customer's whole history rather than with the batch, and
 * which timed out at 19k demo events long before a Govern customer's volume.
 * The saving is a sum over per-event costs, and cost is linear in tokens, so
 * summing tokens first is the same number by construction.
 */
interface BasisRow {
  switch_id: string;
  model_key: string;
  host: string;
  original_model_key: string | null;
  original_host: string | null;
  events: number;
  input_tokens: number;
  output_tokens: number;
  /**
   * Dispatch 204. The cache mix that actually occurred on the rerouted
   * traffic. It is a property of the WORKLOAD, so the same mix is priced on
   * both sides of the comparison — cheaply where the destination caches, at
   * full input rate where it does not.
   */
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}

/**
 * Dispatch 236. The workload's cache mix BEFORE the switch ran, per switch and
 * per raw reported pair.
 *
 * The counterfactual asks "what would this traffic have cost if we had not
 * moved it", and the honest answer prices it with the cache behaviour the
 * ORIGINAL pair actually had — not with the mix the destination happens to
 * report after the move. A move from a warm-cache host to a cold one otherwise
 * prices the "before" world at the destination's cold mix and understates the
 * loss (and the reverse overstates the win).
 *
 * Pairs come back raw on purpose: alias resolution lives in TypeScript
 * (`buildModelResolver` / `buildHostResolver`) and is not callable from SQL, so
 * matching happens here with the same resolver the rest of this file uses
 * rather than with a second normalizer written in SQL.
 */
interface PriorBasisRow {
  switch_id: string;
  model_key: string;
  host: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}

interface PriorMix {
  inputTokens: number;
  readTokens: number;
  writeTokens: number;
}


/**
 * Read every rerouted, successful event in a workspace and total the observed
 * saving per switch. Pure read — nothing is written here, so this is also what
 * an auditor calls to check the stored figure independently.
 */
export async function computeSwitchSavings(
  db: Db,
  orgId: string,
  only?: string[],
): Promise<SwitchSavings[]> {
  const rpc = (db as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  }).rpc;
  const args = {
    _org_id: orgId,
    _switch_ids: only && only.length > 0 ? only : null,
  };
  const { data, error } = (await rpc.call(db, "switch_savings_basis", args)) as {
    data: BasisRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(`switch savings basis unreadable: ${error.message}`);
  const groups = data ?? [];
  if (groups.length === 0) return [];

  const prior = (await rpc.call(db, "switch_savings_prior_basis", args)) as {
    data: PriorBasisRow[] | null;
    error: { message: string } | null;
  };
  if (prior.error) throw new Error(`switch savings prior basis unreadable: ${prior.error.message}`);
  const priorRows = prior.data ?? [];



  /**
   * Live, real price rows only. A delisted pair is not a price we would quote
   * anywhere else in the product, so it is not a price we will credit a saving
   * against either — an event priced against a withdrawn row lands in
   * `unpricedEvents` and is visibly excluded rather than quietly valued.
   */
  const priceRows = await fetchAllRows<PriceRow>((f, t) =>
    db
      .from("host_prices")
      .select(
        "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching",
      )
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
        // Null stays null. Coercing an absent cache rate to 0 here would
        // hand every non-caching host a free cached prefix and manufacture a
        // saving that no invoice would ever show.
        cache_read_usd_per_mtok:
          p.cache_read_usd_per_mtok == null ? null : Number(p.cache_read_usd_per_mtok),
        cache_write_usd_per_mtok:
          p.cache_write_usd_per_mtok == null ? null : Number(p.cache_write_usd_per_mtok),
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

  /**
   * Pre-switch history, folded onto RESOLVED pairs with the resolver above.
   * `openai/gpt-5.5|openai` and `gpt-5.5|api.openai.com` are the same workload
   * and must land in the same bucket, which is exactly what a raw SQL match
   * would have missed.
   */
  const priorBySwitch = new Map<string, Map<string, PriorMix>>();
  for (const p of priorRows) {
    const model = resolveModel(p.model_key).key;
    const host = resolveHost(p.host, model).key;
    const byPair = priorBySwitch.get(p.switch_id) ?? new Map<string, PriorMix>();
    const key = `${model}|${host}`;
    const agg = byPair.get(key) ?? { inputTokens: 0, readTokens: 0, writeTokens: 0 };
    agg.inputTokens += Number(p.input_tokens ?? 0);
    agg.readTokens += Number(p.cache_read_tokens ?? 0);
    agg.writeTokens += Number(p.cache_write_tokens ?? 0);
    byPair.set(key, agg);
    priorBySwitch.set(p.switch_id, byPair);
  }

  const acc = new Map<string, SwitchSavings>();
  for (const g of groups) {
    const switchId = g.switch_id;
    const count = Number(g.events);
    const row =
      acc.get(switchId) ??
      ({
        switchId,
        events: 0,
        unpricedEvents: 0,
        missingOriginalEvents: 0,
        counterfactualUsd: 0,
        actualUsd: 0,
        savedUsd: 0,
        fromModel: g.original_model_key ?? "",
        fromHost: g.original_host ?? "",
        toModel: g.model_key,
        toHost: g.host,
        usedFallbackMix: false,
      } satisfies SwitchSavings);

    // No origin, no counterfactual. `?? ""` here used to resolve to an unpriced
    // pair and quietly contribute $0 — a legitimate-looking result for an event
    // whose "before" nobody ever recorded. It is now counted as its own defect
    // and refuses the credit in `recomputeSwitchSavings`.
    if (!g.original_model_key || !g.original_host) {
      row.missingOriginalEvents += count;
      acc.set(switchId, row);
      continue;
    }

    const before = priceFor(g.original_model_key, g.original_host);
    const after = priceFor(g.model_key, g.host);
    if (!before || !after) {
      row.unpricedEvents += count;
      acc.set(switchId, row);
      continue;
    }


    row.events += count;
    const inputTokens = Number(g.input_tokens);
    const outputTokens = Number(g.output_tokens);
    /** The mix the destination really reported. This prices the actual side. */
    const observedMix = {
      readTokens: Number(g.cache_read_tokens ?? 0),
      writeTokens: Number(g.cache_write_tokens ?? 0),
    };

    /**
     * Dispatch 236. The counterfactual is priced with the mix the ORIGINAL pair
     * had before the switch, scaled onto this batch's input tokens. Without it
     * a move onto a host that reports no cache reads makes the "before" world
     * look cold too, and the loss disappears.
     */
    const originModel = resolveModel(g.original_model_key).key;
    const originHost = resolveHost(g.original_host, originModel).key;
    const priorMix = priorBySwitch.get(switchId)?.get(`${originModel}|${originHost}`);
    let counterfactualMix = observedMix;
    if (priorMix && priorMix.inputTokens > 0) {
      const scale = inputTokens / priorMix.inputTokens;
      counterfactualMix = {
        readTokens: priorMix.readTokens * scale,
        writeTokens: priorMix.writeTokens * scale,
      };
    } else {
      // New workload, nothing to compare against. Fall back to the observed mix
      // and say so on the row rather than swapping the claim in silence.
      row.usedFallbackMix = true;
    }

    row.counterfactualUsd += costOf(before, inputTokens, outputTokens, counterfactualMix);
    row.actualUsd += costOf(after, inputTokens, outputTokens, observedMix);
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
  refusedReason?: SwitchBlockedReason | "switch_not_active" | "origin_unknown";

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
  const computed = (await computeSwitchSavings(db, orgId, only)).filter(
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
    const refusedReason: SwitchBlockedReason | "switch_not_active" | "origin_unknown" | null =
      row.status !== "active"
        ? "switch_not_active"
        : s.missingOriginalEvents > 0
          ? // A rerouted event with no `original_model_key` has no counterfactual.
            // Crediting the rest of the batch would publish a figure computed over
            // traffic we cannot fully account for, so the whole switch refuses.
            "origin_unknown"
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
    const creditUsd = creditableUsd({
      state: refusedReason ? "needs_your_action" : "automatic",
      observedUsd: s.savedUsd,
    });


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
          refusedReason === "origin_unknown"
            ? `Container reported ${s.missingOriginalEvents} rerouted event(s) with no original model/host. ` +
              `There is no counterfactual for those, so nothing on this switch is credited this run.`
            : `Container reported ${s.events} rerouted event(s) worth $${s.savedUsd.toFixed(2)}, ` +
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

