/**
 * The DR self-verification gate.
 *
 * The thing worth testing here is not that the export runs; it is that the
 * self-check is load-bearing. A restore that "succeeded" because applyDump()
 * happened not to throw — while the copy holds the wrong number of rows or has
 * lost its append-only triggers — is exactly the kind of backup that is only
 * discovered to be worthless on the day it is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyDump = vi.fn(async () => 42);
const readTargetCounts = vi.fn(async () => ({ ...SOURCE_COUNTS }));
const readTargetTriggers = vi.fn(async () => [...GOOD_TRIGGERS]);

const SOURCE_COUNTS = {
  organizations: 3,
  subscriptions: 2,
  commission_ledger: 5,
  monthly_kpi_snapshot: 7,
  price_history: 11,
};

const GOOD_TRIGGERS = [
  { table_name: "monthly_kpi_snapshot", trigger_name: "kpi_append_only", enabled: true },
  { table_name: "price_history", trigger_name: "price_history_append_only", enabled: true },
];

vi.mock("../neon.server", () => ({
  DR_PROJECT_NAME: "costmyai-dr-backup",
  ForbiddenTargetError: class extends Error {},
  readNeonConfig: () => ({ url: "postgresql://u:p@ep-dr.aws.neon.tech/dr", host: "ep-dr.aws.neon.tech", database: "dr" }),
  applyDump: (...a: unknown[]) => applyDump(...(a as [])),
  readTargetCounts: (...a: unknown[]) => readTargetCounts(...(a as [])),
  readTargetTriggers: (...a: unknown[]) => readTargetTriggers(...(a as [])),
}));

const updates: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client.server", () => {
  const supabaseAdmin = {
    from: () => ({
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          eq: () => ({
            select: () => ({ maybeSingle: async () => ({ data: { id: "run-1" }, error: null }) }),
            then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
          }),
        };
      },
    }),
    rpc: async (name: string) => {
      if (name === "backup_export_counts") return { data: { ...SOURCE_COUNTS }, error: null };
      return { data: `BEGIN;\n${"-- dump ".repeat(40)}\nCOMMIT;`, error: null };
    },
  };
  return { supabaseAdmin };
});

const { runBackupExport } = await import("../export.server");

beforeEach(() => {
  updates.length = 0;
  applyDump.mockClear();
  applyDump.mockResolvedValue(42);
  readTargetCounts.mockResolvedValue({ ...SOURCE_COUNTS });
  readTargetTriggers.mockResolvedValue([...GOOD_TRIGGERS]);
});

describe("runBackupExport self-verification", () => {
  it("reports ok only when the copy actually verifies", async () => {
    const result = await runBackupExport();
    expect(result.countsMatch).toBe(true);
    expect(result.triggersOk).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("reports ok:false when the restored row counts do not match the source", async () => {
    readTargetCounts.mockResolvedValue({ ...SOURCE_COUNTS, price_history: 10 });
    const result = await runBackupExport();
    expect(result.countsMatch).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("restored copy did not verify");
    expect(updates.at(-1)).toMatchObject({ ok: false, counts_match: false });
  });

  it("reports ok:false when a table is missing from the copy entirely", async () => {
    const partial = { ...SOURCE_COUNTS } as Record<string, number>;
    delete partial["commission_ledger"];
    readTargetCounts.mockResolvedValue(partial as typeof SOURCE_COUNTS);
    const result = await runBackupExport();
    expect(result.ok).toBe(false);
    expect(result.countsMatch).toBe(false);
  });

  it("reports ok:false when an append-only trigger arrived but is disabled", async () => {
    readTargetTriggers.mockResolvedValue([
      { table_name: "monthly_kpi_snapshot", trigger_name: "kpi_append_only", enabled: true },
      { table_name: "price_history", trigger_name: "price_history_append_only", enabled: false },
    ]);
    const result = await runBackupExport();
    expect(result.triggersOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(updates.at(-1)).toMatchObject({ ok: false, triggers_ok: false });
  });

  it("reports ok:false when an expected append-only trigger is missing entirely", async () => {
    readTargetTriggers.mockResolvedValue([
      { table_name: "monthly_kpi_snapshot", trigger_name: "kpi_append_only", enabled: true },
    ]);
    const result = await runBackupExport();
    expect(result.triggersOk).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("is never ok merely because applyDump() resolved without throwing", async () => {
    // The restore "succeeds" — and the copy is empty. A decorative self-check
    // would return ok:true here.
    applyDump.mockResolvedValue(9_999);
    readTargetCounts.mockResolvedValue({
      organizations: 0,
      subscriptions: 0,
      commission_ledger: 0,
      monthly_kpi_snapshot: 0,
      price_history: 0,
    });
    readTargetTriggers.mockResolvedValue([]);
    const result = await runBackupExport();
    expect(applyDump).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.countsMatch).toBe(false);
    expect(result.triggersOk).toBe(false);
  });
});
