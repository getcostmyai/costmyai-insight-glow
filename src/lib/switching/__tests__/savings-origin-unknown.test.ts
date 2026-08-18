/**
 * Dispatch 231 — a rerouted event with no origin refuses, it does not price $0.
 *
 * Two layers stand between this shape and the savings figure, and both are
 * proved:
 *
 * 1. The database refuses the row outright — `usage_events_reroute_complete`
 *    (`NOT rerouted OR (original_model_key IS NOT NULL AND original_host IS NOT
 *    NULL)`) holds even for a service-role write, which is why this case cannot
 *    be staged as an integration test.
 * 2. Should that constraint ever be relaxed, or a future `switch_savings_basis`
 *    revision surface a nulled origin, the reader must still refuse. That is
 *    what this test drives, with the basis RPC stubbed to return exactly the
 *    row the constraint currently forbids.
 */
import { describe, expect, it } from "vitest";

import { recomputeSwitchSavings } from "@/lib/switching/savings.server";

const ORG = "11111111-1111-1111-1111-111111111111";
const SWITCH = "22222222-2222-2222-2222-222222222222";

const PRICE = {
  model_key: "gpt-4o-mini",
  host: "api.openai.com",
  host_label: "OpenAI",
  input_usd_per_mtok: 0.15,
  output_usd_per_mtok: 0.6,
  cache_read_usd_per_mtok: null,
  cache_write_usd_per_mtok: null,
  supports_prompt_caching: false,
};

interface Recorded {
  savedUsd: number | null;
  refusalDetail: string | null;
}

/** The narrowest possible stand-in for the three tables this reader touches. */
function fakeDb(recorded: Recorded) {
  const table = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const k of ["select", "eq", "in", "range"]) q[k] = self;
    (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    return q;
  };

  return {
    rpc: (_fn: string, _args: unknown) =>
      Promise.resolve({
        data: [
          {
            switch_id: SWITCH,
            model_key: "gpt-4o-mini",
            host: "api.openai.com",
            original_model_key: null,
            original_host: null,
            events: 3,
            input_tokens: 1_000_000,
            output_tokens: 200_000,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
          },
        ],
        error: null,
      }),
    from(name: string) {
      if (name === "host_prices") return table([PRICE]);
      if (name === "model_catalog") return table([{ model_key: "gpt-4o-mini" }]);
      if (name === "model_aliases") return table([]);
      if (name === "switch_events") {
        return {
          insert: (row: { detail: string }) => {
            recorded.refusalDetail = row.detail;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (name === "switches") {
        const rows = [
          {
            id: SWITCH,
            from_host: "api.openai.com",
            to_host: "api.openai.com",
            autonomous: false,
            status: "active",
            saved_usd: 0,
          },
        ];
        const builder: Record<string, unknown> = {};
        let pendingUpdate: { saved_usd: number } | null = null;
        const self = () => builder;
        builder["select"] = self;
        builder["eq"] = self;
        builder["in"] = self;
        builder["update"] = (patch: { saved_usd: number }) => {
          pendingUpdate = patch;
          return builder;
        };
        builder["maybeSingle"] = () => {
          if (pendingUpdate) {
            recorded.savedUsd = pendingUpdate.saved_usd;
            const stored = pendingUpdate.saved_usd;
            pendingUpdate = null;
            return Promise.resolve({ data: { saved_usd: stored }, error: null });
          }
          return Promise.resolve({ data: { saved_usd: 0 }, error: null });
        };
        (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: rows, error: null });
        return builder;
      }
      throw new Error(`unexpected table ${name}`);
    },
  };
}

describe("savings with an unknown origin", () => {
  it("refuses the switch instead of crediting a $0 result", async () => {
    const recorded: Recorded = { savedUsd: null, refusalDetail: null };
    const [result] = await recomputeSwitchSavings(fakeDb(recorded) as never, ORG, [SWITCH]);

    expect(result).toBeDefined();
    // The event is counted as its own defect, not folded into `unpricedEvents`.
    expect(result!.missingOriginalEvents).toBe(3);
    expect(result!.events).toBe(0);
    expect(result!.refused).toBe(true);
    expect(result!.refusedReason).toBe("origin_unknown");
    expect(result!.storedUsd).toBe(0);
    expect(recorded.savedUsd).toBe(0);
    expect(recorded.refusalDetail).toMatch(/no original model\/host/i);
  });
});
