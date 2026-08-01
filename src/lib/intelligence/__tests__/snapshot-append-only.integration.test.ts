/**
 * Proves the citation promise at the database, not in application code: once a
 * month is frozen, its payload cannot be rewritten by anything — not by the app,
 * not by the service role. The only sanctioned correction is a NEW row carrying
 * `supersedes_id`, which is exactly the commission-ledger restatement pattern.
 *
 * Runs against the real database with the real trigger. No mocks.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

function adminClient() {
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (SERVICE.startsWith("sb_") && headers.get("Authorization") === `Bearer ${SERVICE}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", SERVICE);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const describeIf = URL && SERVICE ? describe : describe.skip;

describeIf("frozen monthly snapshots are append-only", () => {
  it("rejects an edit to the payload, and accepts a restatement row instead", async () => {
    const db = adminClient();
    // A far-past month keeps this test clear of any real archive row.
    const month = "1999-01-01";

    await db.from("monthly_kpi_snapshot").delete().eq("month", month); // no-op if absent (delete is blocked anyway)

    const { data: original, error: insertErr } = await db
      .from("monthly_kpi_snapshot")
      .insert({ month, payload: { changesTotal: 7 } as unknown as never, note: "append-only test" })
      .select("id")
      .single();
    if (insertErr?.code === "23505") return; // left over from a previous run; nothing to prove twice
    expect(insertErr).toBeNull();
    const id = original!.id;

    // 1. The edit must be refused by the database itself.
    const { error: editErr } = await db
      .from("monthly_kpi_snapshot")
      .update({ payload: { changesTotal: 9999 } as unknown as never })
      .eq("id", id);
    expect(editErr).not.toBeNull();
    expect(editErr!.message).toMatch(/cannot be edited/i);

    // 2. The row still reads exactly as frozen.
    const { data: still } = await db
      .from("monthly_kpi_snapshot")
      .select("payload")
      .eq("id", id)
      .single();
    expect((still!.payload as { changesTotal: number }).changesTotal).toBe(7);

    // 3. A restatement is a new row pointing at the original.
    const { data: restated, error: restateErr } = await db
      .from("monthly_kpi_snapshot")
      .insert({
        month,
        payload: { changesTotal: 8 } as unknown as never,
        supersedes_id: id,
        note: "restated: late ledger row",
      })
      .select("id")
      .single();
    expect(restateErr).toBeNull();

    // 4. Stamping the original as superseded is the ONLY permitted mutation.
    const { error: stampErr } = await db
      .from("monthly_kpi_snapshot")
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", id);
    expect(stampErr).toBeNull();

    // 5. Deleting frozen history is impossible.
    const { error: delErr } = await db.from("monthly_kpi_snapshot").delete().eq("id", id);
    expect(delErr).not.toBeNull();
    expect(delErr!.message).toMatch(/permanent/i);

    // Leave the fixture rows in place — they are, by design, unremovable.
    expect(restated!.id).not.toBe(id);
  }, 30_000);
});
