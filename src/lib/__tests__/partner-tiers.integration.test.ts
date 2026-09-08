/**
 * Proves the public partner page cannot drift from reality: the ladder it
 * renders is the same `partner_tiers` table `partner_commission_rate` prices
 * payouts from, read as anon over real RLS. No fixtures, no mocks.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { toLadder, formatRateRange, type PartnerTierRow } from "@/lib/partner-tiers";

const URL = process.env["SUPABASE_URL"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

function anonClient() {
  return createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (PUBLISHABLE.startsWith("sb_") && headers.get("Authorization") === `Bearer ${PUBLISHABLE}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", PUBLISHABLE);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function readRows(): Promise<PartnerTierRow[]> {
  const { data, error } = await anonClient()
    .from("partner_tiers")
    .select("tier, name, min_lifetime_referred_usd, rate_pct")
    .order("tier", { ascending: true });
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({
    tier: Number(r.tier),
    name: r.name as string,
    minLifetimeUsd: Number(r.min_lifetime_referred_usd),
    ratePct: Number(r.rate_pct),
  }));
}

describe("partner page ladder is live", () => {
  it("an anonymous visitor can read the real ladder", async () => {
    const rows = await readRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number.isFinite(r.ratePct)).toBe(true);
      expect(Number.isFinite(r.minLifetimeUsd)).toBe(true);
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it("the headline range is derived from those rows, not from page copy", async () => {
    const rows = await readRows();
    const ladder = toLadder(rows);
    const rates = rows.map((r) => r.ratePct);
    expect(ladder.minRatePct).toBe(Math.min(...rates));
    expect(ladder.maxRatePct).toBe(Math.max(...rates));
    expect(formatRateRange(ladder)).toContain("%");
  });

  it("rates and thresholds both rise with the tier — a ladder, not a list", async () => {
    const rows = await readRows();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.ratePct).toBeGreaterThan(rows[i - 1]!.ratePct);
      expect(rows[i]!.minLifetimeUsd).toBeGreaterThan(rows[i - 1]!.minLifetimeUsd);
    }
  });

  it("the page source contains no hardcoded rate ladder", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/routes/partners.tsx", "utf8"),
    );
    // Any literal percentage or dollar threshold in the page would survive a
    // real tier change in the database — exactly the drift this test forbids.
    expect(src).not.toMatch(/\d+\s*[–-]\s*\d+%/);
    expect(src).not.toMatch(/rate:\s*"\d/);
    expect(src).not.toMatch(/\$\d+K/);
  });
});
