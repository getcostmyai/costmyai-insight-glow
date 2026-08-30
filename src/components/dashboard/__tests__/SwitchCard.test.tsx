// @vitest-environment jsdom
/**
 * SwitchCard's Strong/Even match badge is a second, independent
 * implementation of the isHeadlineEligible boundary — the component reads
 * row.qualityDelta and row.kind itself and decides which label to render.
 * certification-golden.test.ts proves the predicate is correct in isolation;
 * it proves nothing about whether SwitchCard actually calls it correctly, on
 * the right rows, or renders the right string for each branch. This file
 * exercises the real component, not a re-implementation of its logic.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SwitchCard } from "@/components/dashboard/SwitchCard";
import type { SwitchRow } from "@/lib/dashboard-data";
import { CERTIFICATION_MARGIN_CAP } from "@/lib/engine/equivalence";

afterEach(() => {
  cleanup();
});

function makeRow(overrides: Partial<SwitchRow> = {}): SwitchRow {
  return {
    fromModel: "gpt-4o",
    fromHost: "OpenAI",
    toModel: "gpt-4o-mini",
    toHost: "OpenAI",
    fromHostKey: "openai",
    toHostKey: "openai",
    taskHint: "general",
    kind: "quality",
    saving: 12.34,
    savingPct: 40,
    qualityDelta: null,
    ...overrides,
  };
}

function renderCard(row: SwitchRow) {
  return render(
    <SwitchCard row={row} rank={1} period="last 7 days" onActivate={vi.fn()} />,
  );
}

describe("SwitchCard — Strong/Even match badge", () => {
  it("renders 'Strong match' for a quality row at the margin cap boundary (>=, inclusive)", () => {
    renderCard(makeRow({ qualityDelta: CERTIFICATION_MARGIN_CAP }));
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.queryByText("Even match")).not.toBeInTheDocument();
  });

  it("renders 'Strong match' for a quality row above the margin cap", () => {
    renderCard(makeRow({ qualityDelta: CERTIFICATION_MARGIN_CAP + 3.2 }));
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.queryByText("Even match")).not.toBeInTheDocument();
  });

  it("renders 'Even match' for a quality row below the margin cap (non-null)", () => {
    renderCard(makeRow({ qualityDelta: CERTIFICATION_MARGIN_CAP - 0.1 }));
    expect(screen.getByText("Even match")).toBeInTheDocument();
    expect(screen.queryByText("Strong match")).not.toBeInTheDocument();
  });

  it("renders 'Even match' (fails closed, never open) when qualityDelta is null", () => {
    renderCard(makeRow({ qualityDelta: null }));
    expect(screen.getByText("Even match")).toBeInTheDocument();
    expect(screen.queryByText("Strong match")).not.toBeInTheDocument();
  });

  it("renders neither badge for a host-kind row, regardless of qualityDelta", () => {
    renderCard(makeRow({ kind: "host", qualityDelta: CERTIFICATION_MARGIN_CAP + 10 }));
    expect(screen.queryByText("Strong match")).not.toBeInTheDocument();
    expect(screen.queryByText("Even match")).not.toBeInTheDocument();
  });
});
