/**
 * Intelligence Notes — the interpretation layer that sits beside the figures.
 *
 * The Intelligence page states what moved. A note explains why, and the whole
 * risk of doing that is sliding from measurement into speculation. So provenance
 * is not a convention here, it is a required field on every note, and the
 * corpus is validated by test rather than by reviewer memory:
 *
 *   proven-mechanism  a demonstrable cause. MUST carry at least one exhibit —
 *                     the actual artifact, not a description of it.
 *   correlated        a real pattern with an unconfirmed explanation. Rendered
 *                     as analysis, never as settled cause.
 *   third-party       built on someone else's dataset. MUST name the source.
 *
 * Notes are code, not rows: reviewed like code, versioned like code, and
 * impossible to edit invisibly in production — the same reasoning that makes
 * the frozen months append-only.
 */

export type NoteLabel = "proven-mechanism" | "correlated" | "third-party";

export interface LabelMeta {
  /** Chip text. */
  short: string;
  /** The sentence rendered under the deck, in the note's own voice. */
  statement: string;
}

export const LABELS: Record<NoteLabel, LabelMeta> = {
  "proven-mechanism": {
    short: "Proven mechanism",
    statement:
      "Proven mechanism. The cause below is demonstrated by the artifact shown, not inferred from it.",
  },
  correlated: {
    short: "Analysis, not established cause",
    statement:
      "Analysis, not established cause. The pattern is real and measured; the explanation offered for it is a hypothesis and is not established.",
  },
  "third-party": {
    short: "Third-party sourced",
    statement:
      "Third-party sourced. The underlying data is not ours. It is named below, and contextualised here rather than re-presented as our own measurement.",
  },
};

/** Internal destinations a note is allowed to link to. */
export type NotePath =
  | "/intelligence"
  | "/models"
  | "/standard"
  | "/legal/methodology"
  | "/pricing";

/**
 * The evidence artifact. `lines` is reproduced verbatim — a captured envelope,
 * a ledger row, a pair of measurements — and `caption` states where it came
 * from. A note may not claim a mechanism without one of these.
 */
export interface Exhibit {
  /** e.g. "Exhibit A" — rendered as the rail label. */
  ref: string;
  title: string;
  /** Verbatim artifact, one entry per line. Rendered monospace, unwrapped. */
  lines: string[];
  /** Where this artifact came from, and when it was observed. */
  caption: string;
  /** Optional in-repo path a reader can check the claim against. */
  sourcePath?: string;
}

/** A two-sided decomposition: what pushed cost down, what pushed it up, net. */
export interface Decomposition {
  title: string;
  down: { label: string; pct: number };
  up: { label: string; pct: number };
  net: { label: string; pct: number };
  caption: string;
}

export type NoteBlock =
  | { t: "p"; v: string }
  | { t: "h2"; v: string }
  | { t: "defs"; items: { term: string; text: string }[] }
  | { t: "quote"; v: string; attribution: string }
  | { t: "exhibit"; v: Exhibit }
  | { t: "decomposition"; v: Decomposition }
  | { t: "cta"; headline: string; label: string; to: NotePath };

export interface Note {
  slug: string;
  title: string;
  /** Short deck, shown on the index and under the H1. */
  deck: string;
  description: string;
  label: NoteLabel;
  /** Required when label is "third-party": who the data belongs to. */
  source?: string;
  /**
   * The frozen month this note interprets (YYYY-MM), or null for an off-cycle
   * note triggered by the lead detector rather than by the freeze.
   */
  month: string | null;
  published: string;
  minutes: number;
  blocks: NoteBlock[];
}

/**
 * The corpus. Empty until Phase 1 — the infrastructure ships before the first
 * note so that no note is ever written against a moving renderer.
 */
export const NOTES: Note[] = [];

export const noteBySlug = (slug: string): Note | null =>
  NOTES.find((n) => n.slug === slug) ?? null;

export const notesNewestFirst = (): Note[] =>
  [...NOTES].sort((a, b) => (a.published < b.published ? 1 : -1));

export const notesForMonth = (month: string): Note[] =>
  notesNewestFirst().filter((n) => n.month === month);

export const exhibitsOf = (note: Note): Exhibit[] =>
  note.blocks.flatMap((b) => (b.t === "exhibit" ? [b.v] : []));

export const formatNoteDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The label discipline, as executable rules.
 *
 * Returns a list of violations. A non-empty list fails the corpus test, which
 * is the only thing standing between "we agreed to label things" and actually
 * labelling them. `knownMonths` is optional so the pure rules can be checked
 * without a database; the integration test passes the real frozen months.
 */
export function validateNotes(notes: Note[], knownMonths?: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const n of notes) {
    const at = `note "${n.slug}"`;

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.slug)) errors.push(`${at}: slug is not kebab-case`);
    if (seen.has(n.slug)) errors.push(`${at}: duplicate slug`);
    seen.add(n.slug);

    if (!(n.label in LABELS)) errors.push(`${at}: unknown provenance label "${n.label}"`);

    if (n.label === "third-party" && !n.source?.trim()) {
      errors.push(`${at}: label is third-party but no source is named`);
    }
    if (n.label !== "third-party" && n.source?.trim()) {
      errors.push(`${at}: names a source but is not labelled third-party`);
    }

    if (n.label === "proven-mechanism" && exhibitsOf(n).length === 0) {
      errors.push(`${at}: claims a proven mechanism but carries no exhibit`);
    }

    for (const ex of exhibitsOf(n)) {
      if (ex.lines.length === 0) errors.push(`${at}: exhibit "${ex.ref}" has no artifact lines`);
      if (!ex.caption.trim()) errors.push(`${at}: exhibit "${ex.ref}" has no provenance caption`);
    }

    if (!n.title.trim() || !n.deck.trim() || !n.description.trim()) {
      errors.push(`${at}: title, deck and description are all required`);
    }
    if (n.description.length > 160) {
      errors.push(`${at}: description is ${n.description.length} chars, over the 160 limit`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.published)) errors.push(`${at}: published is not YYYY-MM-DD`);

    if (n.month !== null) {
      if (!MONTH_RE.test(n.month)) errors.push(`${at}: month "${n.month}" is not YYYY-MM`);
      else if (knownMonths && !knownMonths.includes(n.month)) {
        errors.push(`${at}: month ${n.month} has no frozen page to attach to`);
      }
    }
  }

  return errors;
}
