import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  PROVIDER_SEEN_WINDOW_DAYS,
  type ProviderGate,
  type ProviderGateState,
} from "@/lib/dashboard/provider-gate";

/**
 * The two signals behind provider-gated switching (Dispatch 155, Stage 1).
 *
 * Both are resolved here, server-side, against real workspace state — there is
 * no static list, no inference from a display name, and no client-side guess.
 * The host keys compared are the canonical keys already written by the ingest
 * resolver and stored on `switches.to_host`, so nothing re-derives
 * canonicalisation further down the chain (that divergence is exactly how a
 * container would decide a switch "matches" something the server never meant).
 */

function adminClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const norm = (host: string) => host.trim().toLowerCase();

export interface RoutingGrantRow {
  host: string;
  granted: boolean;
  containerId: string | null;
  firstGrantedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

/** Every live and revoked grant for a workspace. */
export async function listRoutingGrants(orgId: string): Promise<RoutingGrantRow[]> {
  const db = adminClient();
  const { data, error } = await db
    .from("org_provider_routing")
    .select("host, granted, container_id, first_granted_at, last_seen_at, revoked_at")
    .eq("org_id", orgId);
  if (error) throw new Error(`routing grants unreadable: ${error.message}`);
  return (data ?? []).map((r) => ({
    host: r.host,
    granted: r.granted,
    containerId: r.container_id,
    firstGrantedAt: r.first_granted_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
  }));
}

/**
 * A container reports which destinations it now holds a key for.
 *
 * The credential itself never arrives here and there is no field that could
 * carry one — this records only that the customer put one in their own
 * container. The write is verified, not assumed: an upsert that affects no row
 * is a failure, because a silently missing grant would leave a switch looking
 * executable when nothing can execute it.
 */
export async function assertRoutingGrants(
  orgId: string,
  hosts: string[],
  containerId: string | null,
): Promise<RoutingGrantRow[]> {
  const unique = [...new Set(hosts.map(norm).filter(Boolean))];
  if (unique.length === 0) return [];

  const db = adminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("org_provider_routing")
    .upsert(
      unique.map((host) => ({
        org_id: orgId,
        host,
        granted: true,
        container_id: containerId,
        last_seen_at: now,
        revoked_at: null,
      })),
      { onConflict: "org_id,host" },
    )
    .select("host, granted, container_id, first_granted_at, last_seen_at, revoked_at");
  if (error) throw new Error(`routing grant not recorded: ${error.message}`);
  if (!data || data.length !== unique.length) {
    throw new Error(
      `routing grant not recorded: expected ${unique.length} rows, wrote ${data?.length ?? 0}`,
    );
  }
  return data.map((r) => ({
    host: r.host,
    granted: r.granted,
    containerId: r.container_id,
    firstGrantedAt: r.first_granted_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
  }));
}

/**
 * Withdraw a grant. Takes effect on the container's next poll, and immediately
 * for anything the server decides — a revoked destination stops being
 * executable here before the container has even heard about it.
 */
export async function revokeRoutingGrant(orgId: string, host: string): Promise<void> {
  const db = adminClient();
  const { data, error } = await db
    .from("org_provider_routing")
    .update({ granted: false, revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("host", norm(host))
    .select("host")
    .maybeSingle();
  if (error) throw new Error(`routing grant not revoked: ${error.message}`);
  if (!data) throw new Error(`routing grant not revoked: no grant for ${host}`);
}

/**
 * Signal 1 — every provider this workspace has ever sent real traffic to.
 *
 * Deliberately unbounded in time. The rolling window is reported alongside as
 * `activeRecently` and gates nothing: the live workspace's only real provider
 * last rolled up days ago, and treating that as a disconnection would be both
 * wrong and, worse, self-correcting only when traffic returns.
 */
export async function providersSeen(orgId: string): Promise<Map<string, string>> {
  const db = adminClient();
  const seen = new Map<string, string>();
  const { data, error } = await db
    .from("usage_rollups")
    .select("host, bucket_start")
    .eq("org_id", orgId)
    .eq("granularity", "day");
  if (error) throw new Error(`provider detection failed: ${error.message}`);
  for (const row of data ?? []) {
    const host = norm(row.host);
    const prev = seen.get(host);
    if (!prev || row.bucket_start > prev) seen.set(host, row.bucket_start);
  }
  return seen;
}

/** Signal 3 (not a gate) — destinations this workspace has already switched to. */
export async function providersEverSwitchedTo(orgId: string): Promise<Set<string>> {
  const db = adminClient();
  const { data, error } = await db.from("switches").select("to_host").eq("org_id", orgId);
  if (error) throw new Error(`switch history unreadable: ${error.message}`);
  return new Set((data ?? []).map((r) => norm(r.to_host)));
}

/**
 * Resolve the gate state for a set of canonical destination host keys.
 *
 * `hosts` must already be canonical (the keys the engine wrote onto
 * `switches.to_host` / `recommendations.to_host`).
 */
export async function resolveProviderGates(
  orgId: string,
  hosts: string[],
): Promise<Map<string, ProviderGate>> {
  const wanted = [...new Set(hosts.map(norm).filter(Boolean))];
  const [seen, grants, switched] = await Promise.all([
    providersSeen(orgId),
    listRoutingGrants(orgId),
    providersEverSwitchedTo(orgId),
  ]);

  const granted = new Set(grants.filter((g) => g.granted && !g.revokedAt).map((g) => norm(g.host)));
  const cutoff = Date.now() - PROVIDER_SEEN_WINDOW_DAYS * 86_400_000;

  const out = new Map<string, ProviderGate>();
  for (const host of wanted) {
    const lastSeenAt = seen.get(host) ?? null;
    const state: ProviderGateState = !lastSeenAt
      ? "not_connected"
      : granted.has(host)
        ? "granted"
        : "connected";
    out.set(host, {
      host,
      state,
      lastSeenAt,
      activeRecently: Boolean(lastSeenAt && new Date(lastSeenAt).getTime() >= cutoff),
      everSwitchedTo: switched.has(host),
    });
  }
  return out;
}
