import type { Database } from "@/integrations/supabase/types";
import { fetchAllRows } from "@/lib/paginate.server";

import { PROVIDER_HOSTS } from "./contract";
import { adminClient } from "./ingest.server";
import { shapeForHost } from "./provider-shapes";
import { resolveProviderGates } from "./routing.server";
import {
  decideExecutable,
  phaseFor,
  type SwitchPlan,
  type SwitchPlanEntry,
} from "./switch-plan";

/**
 * Build the plan one workspace's container polls for (Dispatch 155, Stage 2).
 *
 * Read-only. Nothing here activates, pauses or rewrites anything — this stage
 * only makes the server's own decision legible to the container, so that when
 * rewriting does land it is executing a decision that was made here.
 *
 * Match keys are emitted, never derived downstream: for each switch we ship
 * the canonical source model key together with every alias that resolves to
 * it, and the canonical source host together with every hostname mapped to it
 * in `PROVIDER_HOSTS` — the same curated map the ingest host resolver reads.
 * The container does a lowercase exact compare and nothing cleverer.
 */

/** The container may serve a cached plan for this long. */
export const SWITCH_POLL_INTERVAL_MS = 60_000;

const norm = (s: string) => s.trim().toLowerCase();

/** Every spelling of a canonical model key, from the alias table itself. */
async function aliasIndex(
  db: ReturnType<typeof adminClient>,
  modelKeys: Set<string>,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (modelKeys.size === 0) return out;
  const rows = await fetchAllRows<{ alias: string; model_key: string }>((f, t) =>
    db.from("model_aliases").select("alias, model_key").range(f, t),
  );
  for (const row of rows) {
    const key = norm(row.model_key);
    if (!modelKeys.has(key)) continue;
    const list = out.get(key) ?? [];
    list.push(norm(row.alias));
    out.set(key, list);
  }
  return out;
}

/** Every hostname the curated map attributes to a canonical host key. */
function hostSpellings(host: string): string[] {
  const canonical = norm(host);
  const mapped = PROVIDER_HOSTS[canonical] ?? [];
  return [...new Set([canonical, ...mapped.map(norm)])];
}

export async function buildSwitchPlan(orgId: string): Promise<SwitchPlan> {
  const db = adminClient();

  const { data, error } = await db
    .from("switches")
    .select("id, from_model, from_host, to_model, to_host, autonomous, status")
    .eq("org_id", orgId)
    .eq("status", "active" satisfies Database["public"]["Enums"]["switch_status"]);
  if (error) throw new Error(`switch plan unreadable: ${error.message}`);

  const rows = data ?? [];
  const gates = await resolveProviderGates(orgId, rows.map((r) => r.to_host));
  const aliases = await aliasIndex(db, new Set(rows.map((r) => norm(r.from_model))));

  const switches: SwitchPlanEntry[] = rows.map((row) => {
    const fromModel = norm(row.from_model);
    const fromHost = norm(row.from_host);
    const toHost = norm(row.to_host);
    const gate = gates.get(toHost);
    const phase = phaseFor({ fromHost, toHost, toShape: shapeForHost(toHost)?.shape ?? null });
    const decision = decideExecutable({
      phase,
      gate: gate?.state ?? "not_connected",
      autonomous: row.autonomous,
      everSwitchedTo: gate?.everSwitchedTo ?? false,
    });

    return {
      id: row.id,
      phase,
      match: {
        model_keys: [...new Set([fromModel, ...(aliases.get(fromModel) ?? [])])],
        hosts: hostSpellings(fromHost),
      },
      target: { model_key: row.to_model, host: toHost },
      gate: gate?.state ?? "not_connected",
      executable: decision.executable,
      ...(decision.reason ? { blocked_reason: decision.reason } : {}),
      needs_confirmation: decision.needsConfirmation,
    };
  });

  return {
    v: 1,
    org_id: orgId,
    generated_at: new Date().toISOString(),
    poll_interval_ms: SWITCH_POLL_INTERVAL_MS,
    switches,
  };
}
