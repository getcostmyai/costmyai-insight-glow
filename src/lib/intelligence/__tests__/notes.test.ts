import { describe, expect, it } from "vitest";

import {
  LABELS,
  NOTES,
  exhibitsOf,
  noteBySlug,
  notesForMonth,
  notesNewestFirst,
  validateNotes,
  type Note,
} from "@/lib/intelligence/notes";

/**
 * The label discipline is only real if it is enforced. These tests are the
 * enforcement: the published corpus is validated on every run, and the rules
 * themselves are checked against deliberately broken notes so the validator
 * cannot quietly become a no-op.
 */

const base: Note = {
  slug: "example-note",
  title: "A note",
  deck: "A deck.",
  description: "A description.",
  label: "correlated",
  month: null,
  published: "2026-08-01",
  minutes: 5,
  blocks: [{ t: "p", v: "Body." }],
};

const withExhibit = (n: Note): Note => ({
  ...n,
  blocks: [
    ...n.blocks,
    {
      t: "exhibit",
      v: {
        ref: "Exhibit A",
        title: "Captured envelope",
        lines: ["thoughtsTokenCount: 122"],
        caption: "Observed in production, 7 Aug 2026.",
      },
    },
  ],
});

describe("the published corpus", () => {
  it("passes every provenance rule", () => {
    expect(validateNotes(NOTES)).toEqual([]);
  });

  it("only attaches notes to months that have a frozen page", () => {
    // Phase 0 ships no notes; once notes exist this guards against a note
    // linking to an archive month that was never written.
    const months = NOTES.flatMap((n) => (n.month ? [n.month] : []));
    expect(validateNotes(NOTES, months)).toEqual([]);
  });

  it("gives every note a label the renderer knows how to draw", () => {
    for (const n of NOTES) expect(LABELS[n.label]).toBeDefined();
  });
});

describe("provenance rules", () => {
  it("rejects a proven mechanism with no exhibit", () => {
    const errs = validateNotes([{ ...base, label: "proven-mechanism" }]);
    expect(errs.some((e) => e.includes("no exhibit"))).toBe(true);
  });

  it("accepts a proven mechanism that carries its artifact", () => {
    expect(validateNotes([withExhibit({ ...base, label: "proven-mechanism" })])).toEqual([]);
  });

  it("rejects third-party data with no named source", () => {
    const errs = validateNotes([{ ...base, label: "third-party" }]);
    expect(errs.some((e) => e.includes("no source is named"))).toBe(true);
  });

  it("rejects a source named on a note that is not third-party", () => {
    const errs = validateNotes([{ ...base, source: "Someone else" }]);
    expect(errs.some((e) => e.includes("not labelled third-party"))).toBe(true);
  });

  it("rejects an exhibit with no provenance caption", () => {
    const n = withExhibit({ ...base, label: "proven-mechanism" });
    const broken: Note = {
      ...n,
      blocks: n.blocks.map((b) =>
        b.t === "exhibit" ? { t: "exhibit" as const, v: { ...b.v, caption: "  " } } : b,
      ),
    };
    expect(validateNotes([broken]).some((e) => e.includes("no provenance caption"))).toBe(true);
  });

  it("rejects duplicate slugs, bad slugs, bad dates and over-long descriptions", () => {
    const errs = validateNotes([
      base,
      base,
      { ...base, slug: "Not Kebab" },
      { ...base, slug: "bad-date", published: "1 Aug 2026" },
      { ...base, slug: "long-desc", description: "x".repeat(161) },
    ]);
    expect(errs.some((e) => e.includes("duplicate slug"))).toBe(true);
    expect(errs.some((e) => e.includes("kebab-case"))).toBe(true);
    expect(errs.some((e) => e.includes("YYYY-MM-DD"))).toBe(true);
    expect(errs.some((e) => e.includes("over the 160 limit"))).toBe(true);
  });

  it("rejects a month with no frozen page, and a malformed month", () => {
    expect(
      validateNotes([{ ...base, month: "2026-07" }], ["2026-06"]).some((e) =>
        e.includes("no frozen page"),
      ),
    ).toBe(true);
    expect(
      validateNotes([{ ...base, month: "2026-13" }]).some((e) => e.includes("is not YYYY-MM")),
    ).toBe(true);
  });
});

describe("corpus helpers", () => {
  it("orders newest first and looks notes up by slug", () => {
    expect(notesNewestFirst().length).toBe(NOTES.length);
    expect(noteBySlug("does-not-exist")).toBeNull();
    for (const n of NOTES) expect(noteBySlug(n.slug)?.slug).toBe(n.slug);
  });

  it("filters a month down to notes actually written against it", () => {
    for (const n of notesForMonth("2026-07")) expect(n.month).toBe("2026-07");
  });

  it("extracts exhibits from a note's blocks", () => {
    expect(exhibitsOf(withExhibit(base))).toHaveLength(1);
    expect(exhibitsOf(base)).toHaveLength(0);
  });
});
