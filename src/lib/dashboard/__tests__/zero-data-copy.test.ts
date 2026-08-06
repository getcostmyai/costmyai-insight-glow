import { describe, expect, it } from "vitest";

import {
  governGateEmptyCopy,
  lockedFigureLabel,
  lockedHeadline,
  lockedMeasurementNote,
  nonQualifyingEmptyCopy,
} from "@/lib/dashboard/zero-data-copy";

/**
 * Dispatch 119. Each of these strings used to assert that a check had run even
 * when the workspace had no traffic at all. The two facts must stay distinct.
 */
describe("zero-data copy", () => {
  describe("locked level", () => {
    it("never claims a measurement when nothing was evaluated", () => {
      const headline = lockedHeadline({ evaluated: 0, count: 0, what: "quality-matched" });
      const note = lockedMeasurementNote(0);
      expect(headline).toBe("No traffic in this window, so there was nothing to check");
      expect(note).not.toMatch(/ran the check/i);
      expect(note).not.toMatch(/measured, not an estimate/i);
      expect(note).toMatch(/nothing has been measured yet/i);
      expect(lockedFigureLabel(0, "last 30 days")).toBe("nothing measured yet · last 30 days");
    });

    it("keeps the measured claim once real workloads were evaluated", () => {
      expect(lockedHeadline({ evaluated: 12, count: 0, what: "quality-matched" })).toBe(
        "This check found nothing to quality-matched in this window",
      );
      expect(lockedHeadline({ evaluated: 12, count: 1, what: "cheaper-host" })).toBe(
        "1 cheaper-host finding on your traffic",
      );
      expect(lockedHeadline({ evaluated: 12, count: 3, what: "cheaper-host" })).toBe(
        "3 cheaper-host findings on your traffic",
      );
      expect(lockedMeasurementNote(12)).toBe(
        "We ran the check anyway — the number beside it is measured, not an estimate.",
      );
      expect(lockedFigureLabel(12, "last 30 days")).toBe("behind this level · last 30 days");
    });
  });

  describe("List C empty state", () => {
    it("does not claim every workload passed when there were none", () => {
      const copy = nonQualifyingEmptyCopy(0);
      expect(copy).not.toMatch(/every workload/i);
      expect(copy).toMatch(/nothing was evaluated/i);
    });

    it("keeps the pass-through statement when workloads existed", () => {
      expect(nonQualifyingEmptyCopy(9)).toBe(
        "Every workload in this window produced a certified saving. Nothing was refused.",
      );
    });
  });

  describe("Govern gate empty state", () => {
    it("does not claim candidates were rejected when there were none", () => {
      const copy = governGateEmptyCopy({ consideredCount: 0, minMonthlySavingLabel: "$50" });
      expect(copy).not.toMatch(/fell below/i);
      expect(copy).not.toMatch(/could not be certified/i);
      expect(copy).toMatch(/nothing to evaluate/i);
    });

    it("keeps the real-answer statement when candidates were evaluated", () => {
      const copy = governGateEmptyCopy({ consideredCount: 4, minMonthlySavingLabel: "$50" });
      expect(copy).toMatch(/Nothing currently clears the gate/);
      expect(copy).toMatch(/fell below \$50\/mo/);
    });
  });
});
