import { describe, expect, it } from "vitest";

import {
  MOVED_SWITCH_LABEL,
  PENDING_SWITCH_LABEL,
  isSameTarget,
  pendingSwitchIndex,
  supersededLabel,
} from "../pending-switch";

/**
 * Dispatch 212. Disclosure is scoped to the workload, not to the destination.
 *
 * The bug this locks down: the same workload appears in several lists with
 * different destinations, and a list that only matched the exact from→to pair
 * rendered the other lists' entries as untouched, live opportunities while a
 * switch for that workload was already running.
 */

const row = (
  fromModel: string,
  fromHost: string,
  toModel: string,
  toHost: string,
  saved = 0,
) => ({ fromModel, fromHost, toModel, toHost, saved }) as never;

describe("pendingSwitchIndex — workload-scoped disclosure", () => {
  const idx = pendingSwitchIndex([
    row("gpt-5.5", "azure", "gpt-5.5", "openai"),
    row("claude-opus", "anthropic", "claude-haiku", "anthropic", 12.5),
  ]);

  it("discloses a running switch for a row proposing a different destination", () => {
    const active = idx.activeFrom("gpt-5.5", "azure");
    expect(active).toEqual({ toModel: "gpt-5.5", toHost: "openai", moved: false });
    expect(isSameTarget(active, "solar-pro4", "openrouter")).toBe(false);
    expect(supersededLabel(active!)).toBe(
      "Already switched to gpt-5.5 — traffic not yet moved",
    );
  });

  it("still calls the row's own destination armed", () => {
    expect(isSameTarget(idx.activeFrom("gpt-5.5", "azure"), "gpt-5.5", "openai")).toBe(true);
    expect(PENDING_SWITCH_LABEL).toContain("not yet moved");
  });

  it("discloses a switch that has already begun moving traffic", () => {
    const active = idx.activeFrom("claude-opus", "anthropic");
    expect(active?.moved).toBe(true);
    expect(supersededLabel(active!)).toBe("Already switched to claude-haiku");
    expect(MOVED_SWITCH_LABEL).toContain("already moving");
    // "Not yet moved" stays defined by accrued saving, so the armed wording
    // cannot be borrowed by a switch that has booked money.
    expect(idx.pair("claude-opus", "anthropic", "claude-haiku", "anthropic")).toBe(false);
  });

  it("says nothing about a workload with no running switch", () => {
    expect(idx.activeFrom("qwen3-32b", "groq")).toBeNull();
  });
});
