/**
 * Disaster-recovery connection layer, under test at last.
 *
 * The DR path had zero coverage: the one guard that stops a mis-pasted secret
 * from DROPping five production tables in the costmyai-ledger project was
 * never exercised by anything. Everything here is mocked — no database is
 * touched — because what is being asserted is the refusal, the ordering and
 * the cleanup, not Postgres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries: string[] = [];
const connects: number[] = [];
const ends: number[] = [];
let queryImpl: (sql: string) => Promise<{ rows: unknown[] }> = async () => ({ rows: [] });

vi.mock("@neondatabase/serverless", () => ({
  Client: class {
    constructor(public readonly opts: { connectionString: string }) {}
    async connect() {
      connects.push(1);
    }
    async query(sql: string) {
      queries.push(sql);
      return queryImpl(sql);
    }
    async end() {
      ends.push(1);
    }
  },
}));

const {
  readNeonConfig,
  applyDump,
  readTargetCounts,
  readTargetTriggers,
  ForbiddenTargetError,
  DR_PROJECT_NAME,
} = await import("../neon.server");

const ORIGINAL = process.env["NEON_DR_DATABASE_URL"];

beforeEach(() => {
  queries.length = 0;
  connects.length = 0;
  ends.length = 0;
  queryImpl = async () => ({ rows: [] });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["NEON_DR_DATABASE_URL"];
  else process.env["NEON_DR_DATABASE_URL"] = ORIGINAL;
});

describe("readNeonConfig", () => {
  it("returns null when the destination is simply not configured", () => {
    delete process.env["NEON_DR_DATABASE_URL"];
    expect(readNeonConfig()).toBeNull();
  });

  it("accepts a real DR project connection string", () => {
    process.env["NEON_DR_DATABASE_URL"] =
      "postgresql://u:p@ep-dr-backup-123.eu-central-1.aws.neon.tech/costmyai_dr?sslmode=require";
    const cfg = readNeonConfig();
    expect(cfg).toMatchObject({
      host: "ep-dr-backup-123.eu-central-1.aws.neon.tech",
      database: "costmyai_dr",
    });
  });

  it("refuses a host that looks like the ledger project", () => {
    process.env["NEON_DR_DATABASE_URL"] =
      "postgresql://u:p@ep-costmyai-ledger-9.aws.neon.tech/main?sslmode=require";
    expect(() => readNeonConfig()).toThrow(ForbiddenTargetError);
  });

  it("refuses when the marker is in the DATABASE name rather than the host", () => {
    process.env["NEON_DR_DATABASE_URL"] = "postgresql://u:p@ep-safe-1.aws.neon.tech/ledger";
    expect(() => readNeonConfig()).toThrow(/costmyai-ledger/);
  });

  it("matches the marker case-insensitively", () => {
    process.env["NEON_DR_DATABASE_URL"] = "postgresql://u:p@ep-LEDGER-1.aws.neon.tech/Main";
    expect(() => readNeonConfig()).toThrow(ForbiddenTargetError);
  });

  it("names the DR project in the refusal, so the operator knows what to paste", () => {
    process.env["NEON_DR_DATABASE_URL"] = "postgresql://u:p@ep-ledger.aws.neon.tech/main";
    expect(() => readNeonConfig()).toThrow(new RegExp(DR_PROJECT_NAME));
  });

  it("fails loudly on a malformed connection string rather than returning null", () => {
    process.env["NEON_DR_DATABASE_URL"] = "not-a-url";
    expect(() => readNeonConfig()).toThrow(ForbiddenTargetError);
  });
});

const cfg = { url: "postgresql://u:p@ep-dr.aws.neon.tech/costmyai_dr", host: "ep-dr.aws.neon.tech", database: "costmyai_dr" };

describe("applyDump", () => {
  it("drops the exported tables BEFORE restoring, and only those tables", async () => {
    await applyDump(cfg, "BEGIN;\nINSERT INTO public.\"organizations\" VALUES (1);\nCOMMIT;", [
      "organizations",
      "price_history",
    ]);

    expect(queries).toHaveLength(1);
    const script = queries[0]!;
    expect(script).toContain('DROP TABLE IF EXISTS public."organizations" CASCADE;');
    expect(script).toContain('DROP TABLE IF EXISTS public."price_history" CASCADE;');
    expect(script.indexOf("DROP TABLE")).toBeLessThan(script.indexOf("INSERT INTO"));
    // Exactly the scoped tables — nothing else in the schema is touched.
    expect(script.match(/DROP TABLE/g)).toHaveLength(2);
  });

  it("closes the connection on success", async () => {
    await applyDump(cfg, "BEGIN;COMMIT;", ["organizations"]);
    expect(connects).toHaveLength(1);
    expect(ends).toHaveLength(1);
  });

  it("closes the connection even when the restore throws", async () => {
    queryImpl = async () => {
      throw new Error("syntax error at or near");
    };
    await expect(applyDump(cfg, "BEGIN;COMMIT;", ["organizations"])).rejects.toThrow("syntax error");
    expect(ends).toHaveLength(1);
  });
});

describe("readTargetCounts", () => {
  it("reads back one count per table, as numbers", async () => {
    queryImpl = async () => ({
      rows: [
        { t: "organizations", n: "12" },
        { t: "price_history", n: 400 },
      ],
    });
    const counts = await readTargetCounts(cfg, ["organizations", "price_history"]);
    expect(counts).toEqual({ organizations: 12, price_history: 400 });
    expect(queries[0]).toContain('FROM public."organizations"');
    expect(queries[0]).toContain("UNION ALL");
    expect(ends).toHaveLength(1);
  });
});

describe("readTargetTriggers", () => {
  it("returns the non-internal public triggers with their enabled flag", async () => {
    queryImpl = async () => ({
      rows: [{ table_name: "price_history", trigger_name: "price_history_append_only", enabled: true }],
    });
    const rows = await readTargetTriggers(cfg);
    expect(rows).toEqual([
      { table_name: "price_history", trigger_name: "price_history_append_only", enabled: true },
    ]);
    expect(queries[0]).toContain("pg_trigger");
    expect(queries[0]).toContain("NOT tg.tgisinternal");
    expect(ends).toHaveLength(1);
  });
});
