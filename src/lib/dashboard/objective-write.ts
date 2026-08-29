import type { SupabaseClient } from "@supabase/supabase-js";

import type { ObjectiveKind } from "../engine/types";

/**
 * Write the account-wide objective (the null workload scope).
 *
 * Uniqueness of that scope is an expression index (COALESCE(model_key,'*') …),
 * which PostgREST cannot target with ON CONFLICT — an upsert fails with 42P10.
 * So this updates first and only inserts when no row existed. The write goes
 * through the caller's own RLS-scoped client, so only a manager of that
 * workspace can land it.
 */
export interface AccountObjectiveFields {
  objective: ObjectiveKind;
  quality_floor_score: number | null;
  max_latency_ms: number | null;
}

export async function writeAccountObjective(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  userId: string | null,
  fields: AccountObjectiveFields,
): Promise<void> {
  const updated = await supabase
    .from("objectives")
    .update(fields)
    .eq("org_id", orgId)
    .is("model_key", null)
    .is("host", null)
    .is("task_hint", null)
    .select("id");

  let error = updated.error;
  if (!error && (updated.data ?? []).length === 0) {
    const inserted = await supabase.from("objectives").insert({
      org_id: orgId,
      model_key: null,
      host: null,
      task_hint: null,
      created_by: userId,
      is_synthetic: false,
      ...fields,
    });
    // A concurrent writer won the race and has already applied its own values.
    error = inserted.error?.code === "23505" ? null : inserted.error;
  }

  if (error) {
    if (error.code === "42501") throw new Error("Only workspace owners and admins can do that.");
    throw error;
  }
}
