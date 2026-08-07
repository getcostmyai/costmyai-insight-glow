import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DETECTOR_LABELS, type DetectorId } from "@/lib/intelligence/leads";

/** Serializable shape of a lead's evidence, as it crosses the RPC boundary. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface LeadRow {
  id: string;
  detector: DetectorId;
  detectorLabel: string;
  dedupeKey: string;
  severity: string;
  title: string;
  summary: string;
  evidence: Json;
  status: string;
  editorNote: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

const STATUSES = ["open", "accepted", "dismissed", "written"] as const;

/**
 * The editorial queue.
 *
 * Platform admin only: leads name internal detector thresholds and carry raw
 * evidence, and nothing here has been through the provenance-labelling step
 * that makes a claim publishable.
 */
export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ leads: LeadRow[]; readAt: string }> => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error("Not found");

    const { data, error } = await context.supabase
      .from("intelligence_leads")
      .select(
        "id, detector, dedupe_key, severity, title, summary, evidence, status, editor_note, first_seen_at, last_seen_at",
      )
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (error) throw error;

    return {
      leads: (data ?? []).map((r) => ({
        id: String(r.id),
        detector: r.detector as DetectorId,
        detectorLabel: DETECTOR_LABELS[r.detector as DetectorId] ?? String(r.detector),
        dedupeKey: String(r.dedupe_key),
        severity: String(r.severity),
        title: String(r.title),
        summary: String(r.summary),
        evidence: (r.evidence ?? {}) as Json,
        status: String(r.status),
        editorNote: r.editor_note ? String(r.editor_note) : null,
        firstSeenAt: String(r.first_seen_at),
        lastSeenAt: String(r.last_seen_at),
      })),
      readAt: new Date().toISOString(),
    };
  });

/** Triage one lead. The verdict is the editor's; the detector never overwrites it. */
export const setLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; note?: string }) => {
    if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
      throw new Error(`Unknown status ${input.status}`);
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error("Not found");

    // Written through the caller's own RLS-scoped client, and verified by the
    // row coming back: "did not throw" is not a write (Dispatch 91).
    const { data: row, error } = await context.supabase
      .from("intelligence_leads")
      .update({ status: data.status, editor_note: data.note ?? null })
      .eq("id", data.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Lead not found, or not updatable by this account");
    return { id: String(row.id), status: String(row.status) };
  });
