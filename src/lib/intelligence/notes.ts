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
 * Note 1 — reasoning tokens are billed output.
 *
 * Every figure below is either reproduced verbatim from a captured response or
 * read from our own live catalog on the date stated in the caption. Nothing
 * here is modelled.
 */
const REASONING_OVERHEAD: Note = {
  slug: "reasoning-tokens-are-billed-output",
  title: "The tokens you cannot see are the ones you pay for",
  deck: "A thinking model answered with one token and billed us for sixty-eight. The gap is not an anomaly, it is how reasoning models report themselves, and most cost tooling reads the wrong field.",
  description:
    "A captured Gemini response billed 68 output tokens while reporting 1. Why reasoning overhead is invisible to most AI cost tooling.",
  label: "proven-mechanism",
  month: "2026-07",
  published: "2026-08-07",
  minutes: 6,
  blocks: [
    {
      t: "p",
      v: "A model was asked for one word. It replied with one word. The response envelope reported candidatesTokenCount: 1, and any tool reading that field would have recorded a single output token against the call. Google billed sixty-eight.",
    },
    {
      t: "p",
      v: "The missing sixty-seven were reasoning tokens: text the model generated to work out its answer, discarded before the answer was returned, and charged at the full output rate. They are reported, but in a different field, and they never appear in the answer you receive.",
    },
    { t: "h2", v: "The captured envelope" },
    {
      t: "p",
      v: "This is the response that exposed it, reproduced as it arrived through our connector. Read the four numbers together: seven in, one answer token out, sixty-seven thought tokens, and a total the first three do not obviously explain until you add the thoughts to the output.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit A",
        title: "usageMetadata from a real generateContent response",
        lines: [
          '"modelVersion": "gemini-3.6-flash",',
          '"usageMetadata": {',
          '  "promptTokenCount": 7,',
          '  "candidatesTokenCount": 1,',
          '  "thoughtsTokenCount": 67,',
          '  "totalTokenCount": 75',
          "}",
        ],
        caption:
          "Captured through the CostMyAI connector on a live generativelanguage.googleapis.com call, and pinned as a regression test the same day. The response body itself is not retained; only the usage block above.",
        sourcePath: "src/lib/ingest/__tests__/dispatch-109.test.ts",
      },
    },
    {
      t: "defs",
      items: [
        {
          term: "promptTokenCount",
          text: "What you sent. Billed at the input rate, and reported by everyone.",
        },
        {
          term: "candidatesTokenCount",
          text: "The answer you received. This is the field most cost tooling reads, and on a thinking model it is a fraction of what you are charged for.",
        },
        {
          term: "thoughtsTokenCount",
          text: "Reasoning the model generated and then discarded. Billed at the output rate, never shown to you, and absent from the answer entirely.",
        },
        {
          term: "totalTokenCount",
          text: "Prompt plus answer plus thoughts. 7 + 1 + 67 = 75, which is the only place the discrepancy is visible without knowing the field exists.",
        },
      ],
    },
    { t: "h2", v: "What it costs when you read the wrong field" },
    {
      t: "p",
      v: "Gemini 3.6 Flash lists at $0.75 per million input tokens and $3.75 per million output tokens on Google's own endpoint, as tracked in our live catalog. Priced against that, the call above costs $0.00026. Priced from candidatesTokenCount alone it costs $0.000009 — twenty-nine times less. On output alone the under-count is sixty-eight to one.",
    },
    {
      t: "p",
      v: "Ratios that extreme come from a one-word answer, and a long answer dilutes them. The direction never reverses. Reasoning tokens are additive: they can only make a call cost more than the answer suggests, never less, and the shorter and harder the question, the wider the gap.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit B",
        title: "The same call, priced two ways",
        lines: [
          "reading candidatesTokenCount   7 in, 1 out    = $0.000009",
          "reading what Google bills      7 in, 68 out   = $0.000260",
          "understated by                                  28.9x",
          "",
          "at google/gemini-3.6-flash, host google:",
          "  input   $0.75 / 1M tokens",
          "  output  $3.75 / 1M tokens",
        ],
        caption:
          "Prices read from the CostMyAI live catalog on 7 August 2026, first-party Google endpoint. Token counts are Exhibit A verbatim.",
      },
    },
    { t: "h2", v: "Why this is a measurement problem, not a Google problem" },
    {
      t: "p",
      v: "Google reports the number honestly. The failure is downstream: a field that did not exist before reasoning models arrived is now the majority of billed output on those models, and anything written against the older envelope silently under-counts rather than erroring. A wrong number that looks like a right number survives review indefinitely.",
    },
    {
      t: "p",
      v: "The same shape appears elsewhere under different names. OpenAI reports reasoning tokens inside completion_tokens_details; other vendors use reasoning_tokens. Our parser now treats every one of them as billed output, including in the fallback path for envelopes it does not recognise, so an unfamiliar provider under-counts nothing while we work out what it is.",
    },
    {
      t: "p",
      v: "This is the difference between tracking prices and measuring spend. A price tracker tells you the published rate per million tokens, and it was correct here: $3.75 is $3.75. It cannot tell you that the call you just made bought sixty-eight of those tokens and showed you one.",
    },
    {
      t: "h2",
      v: "What to do with this",
    },
    {
      t: "p",
      v: "Check what your own cost reporting reads. If it sums a field named for the answer rather than for the billing, every thinking model in your stack is under-counted, and the error grows precisely as you adopt more reasoning. Then reconcile a month against the provider invoice: a metering path that has never been reconciled against a bill is an estimate wearing the clothes of a measurement.",
    },
    {
      t: "cta",
      headline:
        "Every figure on the Intelligence page is computed from the same parsed envelopes, and the method is written down.",
      label: "How every figure is computed",
      to: "/legal/methodology",
    },
  ],
};

/** The corpus, newest first by convention rather than by requirement. */
export const NOTES: Note[] = [REASONING_OVERHEAD];


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
