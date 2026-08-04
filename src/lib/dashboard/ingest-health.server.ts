import { classifyIngest, type IngestConnection } from "./ingest-health";

/**
 * The reading half of the connection check.
 *
 * Both facts it needs are invisible to the caller's own client: `api_keys` is
 * manager-only under RLS (so the public demo read would see zero tokens and
 * wrongly report a disconnection), and the newest event has to be the newest
 * event, not the newest one the caller happens to be allowed to see. So the
 * read runs with the admin client, loaded inside the function so this module
 * never enters a client bundle, and it is scoped to the one workspace already
 * authorised upstream.
 */
export async function ingestConnection(orgId: string, nowMs: number): Promise<IngestConnection> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [lastEvent, keys] = await Promise.all([
    supabaseAdmin
      .from("usage_events")
      .select("occurred_at")
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from("api_keys").select("revoked_at").eq("org_id", orgId),
  ]);

  const rows = keys.data ?? [];
  const activeTokens = rows.filter((k) => !k.revoked_at).length;
  const lastRevokedAt =
    rows
      .map((k) => k.revoked_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

  return classifyIngest({
    lastEventAt: lastEvent.data?.occurred_at ?? null,
    activeTokens,
    lastRevokedAt,
    nowMs,
  });
}
