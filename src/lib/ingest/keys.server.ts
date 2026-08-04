import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

import type { Database } from "@/integrations/supabase/types";

import { hashApiKey } from "./ingest.server";

/**
 * Workspace ingest tokens.
 *
 * Generated in the dashboard, shown exactly once, stored only as a SHA-256
 * hash with an 8-character prefix for lookup. We cannot recover a token — a
 * lost one is rotated, not retrieved. Revocation takes effect on the next
 * request because authentication reads `revoked_at` on every call.
 */

const TOKEN_PREFIX = "cma_live_";

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface MintedKey {
  id: string;
  name: string;
  /** The only time the raw token exists outside the customer's environment. */
  token: string;
  keyPrefix: string;
  createdAt: string;
}

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

export async function mintApiKey(orgId: string, name: string, createdBy?: string): Promise<MintedKey> {
  const db = adminClient();
  const token = generateToken();
  const { data, error } = await db
    .from("api_keys")
    .insert({
      org_id: orgId,
      name: name.trim() || "Ingest token",
      key_prefix: token.slice(0, 8),
      key_hash: hashApiKey(token),
      created_by: createdBy ?? null,
    })
    .select("id, name, created_at, key_prefix")
    .single();
  if (error) throw new Error(`could not create ingest token: ${error.message}`);

  return { id: data.id, name: data.name, token, keyPrefix: data.key_prefix, createdAt: data.created_at };
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listApiKeys(orgId: string): Promise<ApiKeySummary[]> {
  const db = adminClient();
  const { data, error } = await db
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
    revokedAt: k.revoked_at,
  }));
}

/**
 * Dispatch 91. An update that matches no row returns no error, so a key id
 * belonging to another workspace — or one that does not exist — used to come
 * back as "revoked". A credential the caller believes is dead but is still
 * live is the worst possible false success, so the affected row is read back
 * and its absence is a refusal.
 */
export async function revokeApiKey(orgId: string, keyId: string): Promise<void> {
  const db = adminClient();
  const { data, error } = await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", keyId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That ingest token does not exist in this workspace.");
}

/**
 * Rotation is mint-then-revoke, in that order: the new token is live before the
 * old one dies, so a customer can redeploy without a gap in their traffic.
 */
export async function rotateApiKey(orgId: string, keyId: string, createdBy?: string): Promise<MintedKey> {
  const existing = (await listApiKeys(orgId)).find((k) => k.id === keyId);
  const minted = await mintApiKey(orgId, existing?.name ?? "Ingest token", createdBy);
  await revokeApiKey(orgId, keyId);
  return minted;
}
