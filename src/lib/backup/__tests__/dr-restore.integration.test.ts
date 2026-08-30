/**
 * The DR restore drill, unmocked.
 *
 * A backup nobody has ever restored is a hypothesis, not a backup. This file
 * runs the real export against the real database and the real Neon DR project,
 * then reads the copy back and asserts it verifies — row counts equal to the
 * source and the append-only triggers present AND enabled on the restored
 * tables.
 *
 * It skips LOUDLY when a credential is absent, naming which one, rather than
 * passing silently — a green run that never touched Neon is precisely the false
 * assurance this dispatch exists to remove.
 */
import { describe, expect, it } from "vitest";

import { DR_TABLES, APPEND_ONLY_TABLES } from "../export.server";

const NEON_DR_DATABASE_URL = process.env["NEON_DR_DATABASE_URL"];
const SUPABASE_URL = process.env["SUPABASE_URL"];
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];

const missing = [
  ["NEON_DR_DATABASE_URL", NEON_DR_DATABASE_URL],
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.warn(
    `[dr-restore.integration] SKIPPED — the disaster-recovery drill did not run. Missing credential(s): ${missing.join(", ")}. ` +
      "Provision them to exercise the real restore path; until then the DR path is covered only by mocked unit tests.",
  );
}

const live = NEON_DR_DATABASE_URL && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? describe : describe.skip;

live("disaster-recovery restore drill (live Neon + live database)", () => {
  it("refuses the ledger project outright, before any restore is attempted", async () => {
    const { readNeonConfig, ForbiddenTargetError } = await import("../neon.server");
    const original = process.env["NEON_DR_DATABASE_URL"];
    process.env["NEON_DR_DATABASE_URL"] = "postgresql://u:p@ep-costmyai-ledger-1.aws.neon.tech/main";
    try {
      expect(() => readNeonConfig()).toThrow(ForbiddenTargetError);
    } finally {
      process.env["NEON_DR_DATABASE_URL"] = original;
    }
  });

  it("points at the DR project and not at production", async () => {
    const { readNeonConfig, DR_PROJECT_NAME } = await import("../neon.server");
    const cfg = readNeonConfig();
    expect(cfg).not.toBeNull();
    expect(`${cfg!.host}/${cfg!.database}`.toLowerCase()).not.toContain("ledger");
    expect(DR_PROJECT_NAME).toBe("costmyai-dr-backup");
  });

  it(
    "exports every DR table, restores it into Neon, and the copy self-verifies",
    async () => {
      const { runBackupExport } = await import("../export.server");
      const result = await runBackupExport();

      if (!result.ok) {
        throw new Error(
          `DR restore did not verify: ${result.error ?? "unknown"} (countsMatch=${String(result.countsMatch)}, triggersOk=${String(result.triggersOk)})`,
        );
      }

      expect(result.project).toBe("costmyai-dr-backup");
      expect(result.bytes ?? 0).toBeGreaterThan(100);
      expect(result.countsMatch).toBe(true);
      expect(result.triggersOk).toBe(true);

      for (const table of DR_TABLES) {
        expect(result.targetRowCounts?.[table]).toBe(result.rowCounts?.[table]);
      }
      for (const table of APPEND_ONLY_TABLES) {
        expect(result.triggers?.some((t) => t.table_name === table && t.enabled)).toBe(true);
      }
    },
    300_000,
  );

  it("reads the restored copy back independently of the export's own report", async () => {
    const { readNeonConfig, readTargetCounts } = await import("../neon.server");
    const cfg = readNeonConfig()!;
    const counts = await readTargetCounts(cfg, DR_TABLES);
    for (const table of DR_TABLES) {
      expect(typeof counts[table]).toBe("number");
    }
  });
});
