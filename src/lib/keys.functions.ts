import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ingest token management.
 *
 * The token is what a customer's Verification Engine authenticates with, so
 * minting is deliberately narrow: owners and admins only, never the demo
 * workspace, and the raw value is returned exactly once — afterwards only the
 * SHA-256 hash and an 8-character prefix exist anywhere.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export interface IngestTokenRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface MintedTokenRow extends IngestTokenRow {
  /** Shown once, never recoverable. */
  token: string;
}

/**
 * Authorization is re-derived from the session on every call; the browser only
 * ever names a workspace, never its own rights over it.
 */
async function assertManager(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  orgId: string,
) {
  const manager = await supabase.rpc("is_org_manager", { _org_id: orgId });
  if (manager.error || manager.data !== true) throw new Error("Workspace not found");
  const synthetic = await supabase.rpc("org_is_synthetic", { _org_id: orgId });
  if (synthetic.data === true) throw new Error("The demo workspace is read-only");
}

export const listIngestTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId };
  })
  .handler(async ({ data, context }): Promise<IngestTokenRow[]> => {
    // RLS already restricts reads to managers of the workspace.
    const { data: rows, error } = await context.supabase
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
      revokedAt: k.revoked_at,
    }));
  });

export const createIngestToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; name?: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    const name = (data?.name ?? "").trim().slice(0, 60);
    return { orgId: data.orgId, name };
  })
  .handler(async ({ data, context }): Promise<MintedTokenRow> => {
    await assertManager(context.supabase, data.orgId);
    const { mintApiKey } = await import("@/lib/ingest/keys.server");
    const minted = await mintApiKey(data.orgId, data.name || "Ingest token", context.userId);
    return { ...minted, lastUsedAt: null, revokedAt: null };
  });

export const rotateIngestToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; keyId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (!UUID.test(data?.keyId ?? "")) throw new Error("Unknown token");
    return { orgId: data.orgId, keyId: data.keyId };
  })
  .handler(async ({ data, context }): Promise<MintedTokenRow> => {
    await assertManager(context.supabase, data.orgId);
    const { rotateApiKey } = await import("@/lib/ingest/keys.server");
    const minted = await rotateApiKey(data.orgId, data.keyId, context.userId);
    return { ...minted, lastUsedAt: null, revokedAt: null };
  });

export const revokeIngestToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; keyId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    if (!UUID.test(data?.keyId ?? "")) throw new Error("Unknown token");
    return { orgId: data.orgId, keyId: data.keyId };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, data.orgId);
    const { revokeApiKey } = await import("@/lib/ingest/keys.server");
    await revokeApiKey(data.orgId, data.keyId);
    return { ok: true };
  });
