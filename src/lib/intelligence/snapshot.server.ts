import { createPublicServerClient } from "@/lib/supabase-public.server";
import { readIntelligence, type IntelligencePayload } from "./intelligence.server";

/**
 * Monthly freeze.
 *
 * The live Intelligence page recomputes on every request, which is correct for
 * the open month and useless as a citation: "23 decreases in July" has to still
 * read 23 in two years. So at month close we compute the window one last time
 * and write it into `monthly_kpi_snapshot`, which the database enforces as
 * append-only. A correction is never an edit — it is a new row carrying
 * `supersedes_id`, exactly like the commission ledger's restatement pattern.
 */

export interface FrozenMonth {
  id: string;
  month: string; // YYYY-MM
  frozenAt: string;
  supersedesId: string | null;
  note: string | null;
  restated: boolean;
  payload: IntelligencePayload;
}

export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStartOf(monthKey: string): Date {
  if (!MONTH_KEY_RE.test(monthKey)) throw new Error(`invalid month key: ${monthKey}`);
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** The month immediately before the one containing `now` — the one that just closed. */
export function previousMonthKey(now: Date = new Date()): string {
  return monthKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

export function monthLabelOf(monthKey: string): string {
  return monthStartOf(monthKey).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A closed month can be frozen; the open month never can. */
export function isClosedMonth(monthKey: string, now: Date = new Date()): boolean {
  return monthStartOf(monthKey) < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

interface SnapshotRow {
  id: string;
  month: string;
  payload: unknown;
  frozen_at: string;
  supersedes_id: string | null;
  superseded_at: string | null;
  note: string | null;
}

function toFrozen(row: SnapshotRow): FrozenMonth {
  return {
    id: row.id,
    month: row.month.slice(0, 7),
    frozenAt: row.frozen_at,
    supersedesId: row.supersedes_id,
    note: row.note,
    restated: row.supersedes_id != null,
    payload: row.payload as IntelligencePayload,
  };
}

/** The row in force for a month: the newest one that has not been superseded. */
export async function readFrozenMonth(monthKey: string): Promise<FrozenMonth | null> {
  if (!MONTH_KEY_RE.test(monthKey)) return null;
  const supabase = createPublicServerClient();
  const { data } = await supabase
    .from("monthly_kpi_snapshot")
    .select("id, month, payload, frozen_at, supersedes_id, superseded_at, note")
    .eq("month", `${monthKey}-01`)
    .is("superseded_at", null)
    .order("frozen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toFrozen(data as SnapshotRow) : null;
}

/** Every archived month, newest first — the permanent index. */
export async function listFrozenMonths(): Promise<{ month: string; frozenAt: string }[]> {
  const supabase = createPublicServerClient();
  const { data } = await supabase
    .from("monthly_kpi_snapshot")
    .select("month, frozen_at, superseded_at")
    .is("superseded_at", null)
    .order("month", { ascending: false })
    .limit(240);
  return (data ?? []).map((r) => ({ month: String(r.month).slice(0, 7), frozenAt: r.frozen_at }));
}

export interface FreezeResult {
  month: string;
  action: "created" | "restated" | "already-frozen";
  id: string;
}

/**
 * Freeze a closed month. Idempotent by default: a month that already holds a
 * live row is left exactly as it is. `restate` files a new row referencing the
 * one in force and stamps that row as superseded — the only mutation the
 * database permits on frozen history.
 */
export async function freezeMonth(
  monthKey: string,
  opts: { restate?: boolean; note?: string } = {},
): Promise<FreezeResult> {
  if (!MONTH_KEY_RE.test(monthKey)) throw new Error(`invalid month key: ${monthKey}`);
  if (!isClosedMonth(monthKey)) throw new Error(`${monthKey} has not closed yet`);

  const existing = await readFrozenMonth(monthKey);
  if (existing && !opts.restate) {
    return { month: monthKey, action: "already-frozen", id: existing.id };
  }

  const payload = await readIntelligence(monthStartOf(monthKey));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("monthly_kpi_snapshot")
    .insert({
      month: `${monthKey}-01`,
      payload: payload as unknown as never,
      supersedes_id: existing?.id ?? null,
      note: opts.note ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (existing) {
    const { error: stampErr } = await supabaseAdmin
      .from("monthly_kpi_snapshot")
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (stampErr) throw new Error(stampErr.message);
  }

  return { month: monthKey, action: existing ? "restated" : "created", id: data.id };
}
