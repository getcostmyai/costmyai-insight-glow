/**
 * Phase 0 of the local-classification epic: the widened wire taxonomy.
 *
 * The wire vocabulary (`TASK_HINTS`) and the certification vocabulary
 * (`PRODUCT_TASKS` / `TASK_LADDERS`) are two different lists joined by one
 * function, `normalizeTask`. This file is the proof that the join holds for
 * EVERY wire value, end to end: wire -> schema -> rollup grouping key ->
 * resolveLadder. A label that parses but cannot resolve is a label that
 * silently refuses on a real customer's dashboard, which is exactly the
 * failure this widening exists to prevent.
 */

import { describe, expect, it } from "vitest";

import {
  AA_FIELDS,
  normalizeTask,
  resolveLadder,
  SEPARATION_THRESHOLD,
  TASK_LADDERS,
  type AaField,
} from "../../benchmarks/task-ladder";
import { rollupEvents, type SyntheticEvent } from "../../synthetic/generator";
import { TASK_HINTS, UNKNOWN_TASK_HINT } from "../contract";
import { ingestEventSchema } from "../schema";

/** Every certifying instrument separates cleanly, so the walk is decided by the ladder alone. */
const allSeparating = (_field: AaField) => SEPARATION_THRESHOLD + 1;

/** The instrument each wire label MUST land on. Change this and you change a customer's verdict. */
const EXPECTED_INSTRUMENT: Record<string, AaField | null> = {
  code: "terminalbench_v2_1",
  reasoning: "hle",
  agentic: "tau_banking",
  generation: "lcr",
  classification: "lcr",
  unknown: null,
};

const priceFor = () => ({
  model_key: "m",
  host: "h",
  host_label: "H",
  input_usd_per_mtok: 1,
  output_usd_per_mtok: 2,
});

function event(taskHint: string): SyntheticEvent {
  return {
    occurredAt: new Date("2026-08-19T10:00:00.000Z"),
    modelKey: "claude-sonnet-4.5",
    host: "anthropic",
    taskHint,
    inputTokens: 1000,
    outputTokens: 200,
    latencyMs: 900,
    status: "ok",
  };
}

describe("wire task taxonomy", () => {
  it("is exactly the labels the ladder can tell apart", () => {
    expect([...TASK_HINTS].sort()).toEqual(
      ["agentic", "classification", "code", "generation", "reasoning", "unknown"].sort(),
    );
    expect(UNKNOWN_TASK_HINT).toBe("unknown");
  });

  it("every wire label parses, and nothing outside the list does", () => {
    for (const hint of TASK_HINTS) {
      const parsed = ingestEventSchema.parse({
        model_key: "claude-sonnet-4.5",
        host: "anthropic",
        task_hint: hint,
        input_tokens: 1000,
        output_tokens: 200,
      });
      expect(parsed.task_hint).toBe(hint);
    }

    // Still strict, just wider. Internal ladder names are NOT wire values.
    for (const rejected of ["coding", "planning", "summarization", "chat", "", "CODE"]) {
      expect(() =>
        ingestEventSchema.parse({
          model_key: "m",
          host: "h",
          task_hint: rejected,
          input_tokens: 1,
          output_tokens: 1,
        }),
      ).toThrow();
    }
  });

  it("defaults to unknown when the connector sends no label", () => {
    const parsed = ingestEventSchema.parse({
      model_key: "m",
      host: "h",
      input_tokens: 1,
      output_tokens: 1,
    });
    expect(parsed.task_hint).toBe(UNKNOWN_TASK_HINT);
  });

  it("normalizeTask resolves every certifying label and refuses unknown", () => {
    for (const hint of TASK_HINTS) {
      const normalized = normalizeTask(hint);
      if (hint === UNKNOWN_TASK_HINT) {
        expect(normalized).toBeNull();
        continue;
      }
      expect(normalized).not.toBeNull();
      // A label that normalizes to a task with an EMPTY ladder would parse,
      // group and then refuse forever — indistinguishable from a bug.
      expect(TASK_LADDERS[normalized!].length).toBeGreaterThan(0);
    }
  });

  it("each label lands on its intended instrument", () => {
    for (const hint of TASK_HINTS) {
      const resolution = resolveLadder(hint, allSeparating);
      expect(resolution.field).toBe(EXPECTED_INSTRUMENT[hint]);
      if (hint === UNKNOWN_TASK_HINT) {
        expect(resolution.refusal).toBe("no_valid_instrument");
      } else {
        expect(resolution.refusal).toBeNull();
        expect(AA_FIELDS).toContain(resolution.field);
      }
    }
  });

  it("rollups group each label into its own bucket, and never merge two", () => {
    const events = TASK_HINTS.map((hint) => event(hint));
    const day = rollupEvents(events, "day", priceFor as never);

    expect(day).toHaveLength(TASK_HINTS.length);
    expect(day.map((r) => r.taskHint).sort()).toEqual([...TASK_HINTS].sort());
    for (const row of day) expect(row.requests).toBe(1);
  });

  it("existing unknown-labelled traffic is untouched by the widening", () => {
    // The chain-drill events are all `unknown`. Widening the enum must not
    // relabel, re-bucket or re-certify a single one of them.
    const drill = [event("unknown"), event("unknown"), event("unknown"), event("unknown")];
    const day = rollupEvents(drill, "day", priceFor as never);

    expect(day).toHaveLength(1);
    expect(day[0].taskHint).toBe("unknown");
    expect(day[0].requests).toBe(4);
    expect(resolveLadder("unknown", allSeparating).refusal).toBe("no_valid_instrument");
  });
});
