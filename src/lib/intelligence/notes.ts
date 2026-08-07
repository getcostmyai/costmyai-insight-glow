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
      t: "p",
      v: "There is a second consequence, taken up in a later note rather than here: if the billed number lives in a field the answer does not touch, then an unchanged request is free to get more expensive without anything visible changing. That is the argument in \"An audit is a photograph of a market that keeps moving\", which uses the envelope above as its starting point.",
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
/**
 * Note 2 — what a certification and a refusal actually are.
 *
 * Every number below was read out of the live benchmark ledger and the live
 * catalog on 7 August 2026, and the certified pairing is the verbatim output
 * of the same function that writes customer recommendations. Nothing is
 * illustrative.
 */
const EQUIVALENCE_VERDICTS: Note = {
  slug: "what-certified-and-refused-mean",
  title: "Thirty-seven models are tied for first, and that is the finding",
  deck: "A cheaper model is only equal to an expensive one if a test says so. On one benchmark that test returns a verdict; on another it returns a thirty-seven-way tie, and the honest answer there is no answer.",
  description:
    "GPQA cannot separate 37 of 138 models. What a statistical equivalence test certifies, what it refuses, and why the difference is the product.",
  label: "proven-mechanism",
  month: "2026-07",
  published: "2026-08-07",
  minutes: 7,
  blocks: [
    {
      t: "p",
      v: "Every AI cost tool will happily tell you a cheaper model exists. The only question that matters is whether it is the same model for your work, and answering that is not a matter of reading a leaderboard row. A benchmark score is a measurement, and every measurement has a precision. Below that precision, a difference in rank is not a difference in quality — it is noise with an ordering imposed on it.",
    },
    {
      t: "p",
      v: "So a switch here is decided by a test, not by a ranking. The test has two possible outcomes, and both are published: certified, or refused. The refusals are the more interesting half, because they are the ones a leaderboard cannot produce.",
    },
    { t: "h2", v: "The two words, defined" },
    {
      t: "defs",
      items: [
        {
          term: "Margin",
          text: "The measurement precision of one evaluation, synced alongside the scores rather than assumed. A difference smaller than the margin is not a real difference, however confidently a leaderboard orders it.",
        },
        {
          term: "Certified",
          text: "The cheaper model scores at or above the incumbent's score minus that evaluation's margin, on an instrument that still separates models, and it is genuinely cheaper on your own token shape. Any gap has to be inside the precision, and it is stated in the recommendation rather than hidden.",
        },
        {
          term: "Refused",
          text: "No claim is available. Either no independent evaluation measures this kind of work, or the traffic arrived unlabelled, or the instrument that would have to judge it can no longer tell the candidates apart. A refusal is an output, not an error.",
        },
      ],
    },
    { t: "h2", v: "A refusal: the instrument ran out of resolution" },
    {
      t: "p",
      v: "GPQA Diamond is 198 graduate-level science questions. 198 items is not many, and the resulting measurement precision — computed from the item count, not chosen — is ±5.92 points. On 7 August the leaders sat at 94.1. Thirty-seven of the 138 models we hold a measured GPQA score for sit within 5.92 points of that, down to 88.2.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit A",
        title: "GPQA Diamond, top of the field — a 37-way statistical tie",
        lines: [
          "instrument   GPQA Diamond, 198 items",
          "margin       +/- 5.92 points",
          "leaders      94.1  google/gemini-3.1-pro-preview",
          "             94.1  openai/gpt-5.6-sol",
          "             93.5  moonshotai/kimi-k3",
          "             93.5  openai/gpt-5.5",
          "             93.2  anthropic/claude-opus-5",
          "             ...",
          "             88.2  qwen/qwen3.6-plus   <- still inside the margin",
          "",
          "models measured on GPQA        138",
          "inside the margin of the lead   37",
        ],
        caption:
          "Read from the CostMyAI benchmark ledger on 7 August 2026, sentinel (0.000, not-measured) rows excluded. The same crowding was raised independently by our saturation detector the day before.",
        sourcePath: "src/lib/intelligence/leads.ts",
      },
    },
    {
      t: "p",
      v: "Those thirty-seven models are not ranked. They are tied. Handing that instrument the verdict would mean certifying the 88.2 model as equal to the 94.1 model, and certifying all thirty-seven as equal to each other, which is a sentence that should make anyone uncomfortable however true it is of the measurement. GPQA is not broken and the scores are not wrong. The instrument has simply been saturated by the field it was built to measure, and at the top of that field it has no verdict left to give.",
    },
    { t: "h2", v: "A certification: the same two models, an instrument that still separates" },
    {
      t: "p",
      v: "The instrument is chosen before the candidates are, by a ranked ladder: for reasoning work, Humanity's Last Exam first, GPQA only if HLE stops separating models. HLE is 2,500 items, so its precision is ±1.59 points, and only 2 of the same 138 models sit inside that of the leader. Where GPQA has a 37-way tie, HLE has an ordering.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit B",
        title: "The engine's own output on a real reasoning workload",
        lines: [
          'ladder(reasoning) -> "Humanity\'s Last Exam separates by 53.7 points"',
          "  hle   separation 53.7  >= 10.0   selected",
          "  gpqa  separation 59.0            never reached",
          "",
          "incumbent  google/gemini-3.1-pro-preview   HLE 47.0",
          "candidate  meta/muse-spark-1.1             HLE 46.2",
          "margin     +/- 1.59        bar 45.4        gap -0.8",
          "verdict    CERTIFIED, cheaper, quality-equal",
          "",
          "the same pair judged on the saturated instrument:",
          "  gpqa 94.1 vs 89.8  -> no verdict available",
        ],
        caption:
          "findQualityMatches() run against the live catalog and the live benchmark ledger on 7 August 2026. The verdict line is the function's real output, not a description of it.",
        sourcePath: "src/lib/engine/equivalence.ts",
      },
    },
    {
      t: "quote",
      v: "Scores 46.2 against 47.0 today on the independent Humanity's Last Exam benchmark — slightly lower, but the 0.8-point gap is inside this benchmark's ±1.6 measurement precision, so the difference is not statistically real. It stays above the 45.4 minimum we require for this workload.",
      attribution: "The sentence attached to the certified switch, verbatim",
    },
    {
      t: "p",
      v: "Note what that sentence does not do. It does not claim the cheaper model is better. It says it scores lower, states by how much, and states why that gap is not a difference. A recommendation that hid the minus sign would be easier to sell and impossible to defend in front of the engineer who has to sign off on it.",
    },
    { t: "h2", v: "Why the refusals are the point" },
    {
      t: "p",
      v: "A tracker that never refuses is not being generous, it is not testing anything. Ours refuses on unlabelled traffic, because the connector reads the endpoint and the model name and never the prompt, so there is nothing to identify the work. It refuses on task types no independent evaluation currently measures, rather than borrowing an unrelated instrument. And it refuses to let a saturated instrument decide, which is the case above.",
    },
    {
      t: "p",
      v: "The uncomfortable consequence is that our answer for some workloads is that we do not know yet, and we say so on the page instead of filling the space. That is the cost of the claim being worth anything on the workloads where the answer is yes.",
    },
    {
      t: "cta",
      headline:
        "The ladder, the margins and the refusal rules are written down, instrument by instrument.",
      label: "How a switch is certified",
      to: "/legal/methodology",
    },
  ],
};

/**
 * Note 3 — primary-source verification as method.
 *
 * Both quotes below were retrieved from their live URLs on 7 August 2026 and
 * are reproduced verbatim. The price table is our own pull of Microsoft's
 * public retail-price API on the same day, run to check the vendor's own FAQ
 * rather than to take it on trust.
 */
const PRIMARY_SOURCE_VERIFICATION: Note = {
  slug: "why-we-read-the-primary-source",
  title: "Two sentences about the same price, and only one of them is Microsoft's",
  deck: "A widely cited AI pricing tracker says Azure's Global and Regional deployments cost the same per token. Microsoft's own documentation says Regional carries a 10 to 25 percent premium. We checked the meter.",
  description:
    "A cited tracker and Microsoft disagree on Azure OpenAI regional pricing. Why aggregated pricing data inherits upstream errors silently.",
  label: "proven-mechanism",
  month: "2026-07",
  published: "2026-08-07",
  minutes: 5,
  blocks: [
    {
      t: "p",
      v: "This note is not about a wrong number on somebody else's website. It is about where a number comes from, which turns out to decide almost everything about whether it can be trusted six months later.",
    },
    {
      t: "p",
      v: "Here is the case that prompted it. A widely cited AI pricing tracker — not named here, because the point is structural and naming it would make it look personal — states that Azure OpenAI's Global and Regional deployment types carry the same per-token rate, and lists one price per model. Microsoft's own documentation states the opposite, in a sentence with numbers in it.",
    },
    { t: "h2", v: "The two sentences" },
    {
      t: "quote",
      v: "Pricing varies by deployment type: Global (lowest) → Data Zone (~10% premium) → Regional (10–25% premium over Global, varying by region).",
      attribution:
        "Microsoft Learn, Azure OpenAI in Azure AI Foundry Models FAQ — learn.microsoft.com/azure/ai-foundry/openai/faq, retrieved 7 August 2026",
    },
    {
      t: "p",
      v: "Against that, the tracker's position is the absence of a distinction: one rate per model, no deployment-type dimension at all, so a reader planning a Regional deployment in Europe reads a Global price and calls it their budget. On a modest production workload that is a quiet fifth of the bill, and it is quiet because nothing about the page looks uncertain.",
    },
    { t: "h2", v: "Neither sentence is evidence. The meter is." },
    {
      t: "p",
      v: "A vendor FAQ is still a secondary source about the vendor's own prices, so we did not stop there either. Microsoft publishes the actual billing meters through a public, unauthenticated retail-price API. We queried it for a single model and read the rates back per region and per deployment type.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit A",
        title: "Azure retail price meters, gpt-4o input, one model across deployment types",
        lines: [
          "GET prices.azure.com/api/retail/prices",
          "    productName eq 'Azure OpenAI' and contains(skuName,'gpt 4o 1120 Inp')",
          "",
          "USD / 1K tokens   region              SKU",
          "0.0025            eastus              gpt 4o 1120 Inp glbl",
          "0.0025            northeurope         gpt 4o 1120 Inp glbl",
          "0.00275           eastus              gpt 4o 1120 Inp regnl      +10.0%",
          "0.003025          swedencentral       gpt 4o 1120 Inp regnl      +21.0%",
          "0.003025          uksouth             gpt 4o 1120 Inp regnl      +21.0%",
          "0.0033            northeurope         gpt 4o 1120 Inp regnl      +32.0%",
          "0.00275           eastus2             gpt 4o 1120 Inp Data Zone  +10.0%",
          "",
          "Global rate is identical in all 27 commercial regions returned.",
          "Regional rate is not, and is never lower.",
        ],
        caption:
          "Our own query against Microsoft's public Azure Retail Prices API on 7 August 2026, USD, unauthenticated and reproducible by anyone. Percentages are computed against the Global rate for the same model.",
      },
    },
    {
      t: "p",
      v: "The meter confirms the direction and the mechanism. It also shows why a quoted range is not a substitute for a reading: the premium is 10 percent at the bottom, and 32 percent in North Europe on the day we looked, outside the 10 to 25 percent the FAQ describes. We do not read that as the documentation being wrong — a published range can be typical rather than absolute, and one region on one day cannot settle which it is. It is simply the reason to read the meter even when a secondary source agrees with you: the range tells you roughly what to expect, the meter tells you what you will actually be charged. The tracker, meanwhile, was not slightly off. It was missing the dimension the price varies along.",
    },
    { t: "h2", v: "Why this happens by construction" },
    {
      t: "p",
      v: "Aggregated pricing data is compiled once and then cited. The citation carries no memory of how it was compiled, so an error introduced upstream — a simplification, a missed deployment type, a rate that was true last quarter — propagates downstream in a form that looks exactly like a verified fact. Nobody lies. The error simply survives, because there is no step anywhere in the chain whose job is to go back and look.",
    },
    {
      t: "p",
      v: "A connector that reads live vendor data does not have that failure mode, and not because it is more careful. It has no upstream to inherit from. The rate it applies is the rate the vendor is publishing at the moment of the call, and when the vendor changes it, the next read changes with it. A compiled table cannot do that at any level of diligence, because being current is not a property of the diligence, it is a property of the pipeline.",
    },
    {
      t: "p",
      v: "This is the same discipline we hold ourselves to, and it is why these notes look the way they do. Note 1 reproduced the captured response envelope rather than describing it. Note 2 printed the engine's real output, minus sign included, rather than paraphrasing a verdict. The rule is the same one applied outward here: show the artifact, and if there is no artifact, do not make the claim.",
    },
    { t: "h2", v: "Update, 7 August 2026: it is not an Azure quirk" },
    {
      t: "p",
      v: "After publishing we checked whether the deployment-region dimension exists anywhere else, on the assumption that a structure this easy to miss is rarely unique. It is not. Google's Vertex AI price list splits its Claude catalog into two explicitly named groups — \"Models with regional pricing\" and \"Models with uniform pricing across all regions\" — so whether the region dimension exists at all depends on which model you pick from the same vendor on the same page.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit B",
        title: "Vertex AI, Claude models with regional pricing, USD per 1M input tokens",
        lines: [
          "region                     Opus 5     Haiku 4.5    vs Global",
          "Global                     5.00       1.00         —",
          "US Multi-Region (us)       5.50       1.10         +10.0%",
          "EU Multi-Region (eu)       5.50       1.10         +10.0%",
          "us-east5                   5.50       1.10         +10.0%",
          "europe-west1               5.50       1.10         +10.0%",
          "asia-east1                 5.50       1.10         +10.0%",
          "",
          "Same page, separate section: 'Models with uniform pricing",
          "across all regions' — Claude Opus 4.1, Opus 4, Sonnet 4.",
          "For those, the region dimension does not exist at all.",
        ],
        caption:
          "Google Cloud's published Vertex AI generative-AI price list, cloud.google.com/vertex-ai/generative-ai/pricing, retrieved 7 August 2026. The premium is a flat 10 percent on every non-Global tab, unlike Azure's, which varies by region.",
      },
    },
    {
      t: "p",
      v: "Two vendors, two different shapes: Azure's premium varies by region, Google's is a flat ten percent, and Google applies it to some models and not others. What they share is the part that matters here — a headline rate that is the cheapest of several, and a reader who has no way to tell from a one-price-per-model table that they were quoted the floor rather than their rate. We hold no per-region prices ourselves today; every rate in our own catalog is a global rate, and we would rather say that than imply a coverage we do not have.",
    },
    {
      t: "p",
      v: "The practical version, for anyone pricing an AI workload: whichever tool you use, ask where the number came from. If the answer is another tool, you are one link further from the meter than you think.",
    },
    {
      t: "cta",
      headline:
        "Every figure we publish states its source and the date it was read, instrument by instrument.",
      label: "How every figure is computed",
      to: "/legal/methodology",
    },
  ],
};

/**
 * Note 4 — the non-token cost layers on an Azure bill.
 *
 * Every rate below is a real published Azure list price, read on 7 August 2026
 * from either Microsoft's public retail-price API or the relevant pricing page.
 * The arithmetic in Exhibit B is our own, computed from those rates against an
 * explicitly stated footprint. We deliberately do NOT assert the 15-40% figure
 * that circulates in the research literature: see the closing section.
 */
const NON_TOKEN_COST_LAYERS: Note = {
  slug: "the-bill-is-not-just-tokens",
  title: "The meter you are watching is not the only meter running",
  deck: "An idle fine-tuned deployment on Azure bills $1.70 an hour whether or not you call it once. Support, logging, egress and private networking bill too. None of it appears in a price-per-token table.",
  description:
    "Azure's non-token AI cost layers, at real list prices: idle fine-tune hosting, support plans, log ingestion, egress, private endpoints.",
  label: "proven-mechanism",
  month: "2026-07",
  published: "2026-08-07",
  minutes: 6,
  blocks: [
    {
      t: "p",
      v: "Every price comparison in this industry, ours included, is denominated in dollars per million tokens. It is the right unit for the question it answers. It is also, on a real cloud bill, not the only line, and the other lines have a property that makes them easy to underestimate: most of them do not scale with usage at all.",
    },
    {
      t: "p",
      v: "This note is Azure-only, and deliberately so. The same categories almost certainly exist on AWS and Google, but we have not read their meters with the same care, and the point of this series is that unverified generalisation is exactly the failure mode we are trying to avoid.",
    },
    { t: "h2", v: "The layers, at list price" },
    {
      t: "p",
      v: "The most consequential is the one that surprises people, because it is a rental rather than a usage charge. Deploying a fine-tuned model on Azure OpenAI incurs an hourly hosting charge for as long as the deployment exists. Not per call. Per hour.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit A",
        title: "Azure OpenAI hosting and adjacent meters, list price, read from the vendor",
        lines: [
          "FINE-TUNE HOSTING — billed hourly, usage-independent",
          "  1.70 /hr   gpt-4o-0806-FT-Hstng-glbl      = 1,241.00 /mo",
          "  1.70 /hr   gpt-4o-mini-0718-FT-Hstng-glbl = 1,241.00 /mo",
          "  2.04 /hr   gpt-4o-0806-FT-Hstng-regnl     = 1,489.20 /mo",
          "  5.00 /hr   gpt-4-8K-FT-Hstng-glbl         = 3,650.00 /mo",
          "",
          "SUPPORT PLAN — flat monthly",
          "  29.00 /mo    Developer",
          "  100.00 /mo   Standard",
          "  1,000.00 /mo Professional Direct",
          "",
          "PRIVATE NETWORKING — billed hourly per endpoint",
          "  0.01 /hr   Standard Private Endpoint      = 7.30 /mo",
          "",
          "LOG INGESTION — per GB ingested",
          "  2.30 /GB   Azure Monitor, Analytics Logs",
          "  0.50 /GB   Azure Monitor, Basic Logs",
          "  0.10 /GB/mo  interactive retention beyond the included period",
          "",
          "INTERNET EGRESS — per GB, North America / Europe",
          "  free       first 100 GB per month",
          "  0.087 /GB  next 10 TB per month",
          "  0.02 /GB   between regions within North America or Europe",
        ],
        caption:
          "Hosting, provisioned and private-endpoint rates read from Microsoft's public Azure Retail Prices API on 7 August 2026 (unauthenticated, reproducible). Support, Azure Monitor and bandwidth rates from the corresponding azure.microsoft.com pricing pages, same date, USD, pay-as-you-go. Monthly equivalents are the hourly rate multiplied by 730 hours.",
      },
    },
    {
      t: "p",
      v: "The hosting meter deserves the emphasis it is getting here. A fine-tuned gpt-4o deployment left running costs $1,241 a month at list price before a single token is spent, and the failure mode is not exotic: somebody fine-tunes a model to evaluate it, the evaluation finishes, and the deployment is never deleted. There is nothing in a per-token cost model that can see that, because from the token model's point of view the workload stopped.",
    },
    { t: "h2", v: "Why the percentage is the wrong question" },
    {
      t: "p",
      v: "The figure that circulates for this — that non-token layers add somewhere between 15 and 40 percent to a real Azure AI bill — is not one we can verify, and we are not going to repeat it as though we had. It does not describe Azure's price list. It describes somebody's workloads. Run the same fixed footprint against three different token spends and the reason becomes obvious.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit B",
        title: "One fixed footprint, three token spends",
        lines: [
          "FIXED MONTHLY FOOTPRINT (list price, 730 h)",
          "  Standard support plan                      100.00",
          "  1 idle fine-tuned gpt-4o deployment      1,241.00",
          "  1 private endpoint                           7.30",
          "  20 GB/mo Analytics Logs @ 2.30              46.00",
          "  250 GB/mo egress (100 free, 150 @ 0.087)    13.05",
          "                                          ---------",
          "  total non-token                          1,407.35",
          "",
          "AS A PERCENTAGE OF TOKEN SPEND",
          "  token spend    non-token    uplift",
          "     500.00       1,407.35    +281.5%",
          "   5,000.00       1,407.35     +28.1%",
          "  50,000.00       1,407.35      +2.8%",
          "",
          "Same footprint. Same vendor. Same day.",
          "Drop the idle fine-tune and the total falls to 166.35,",
          "which is +3.3% at a 5,000 token spend, not +28.1%.",
        ],
        caption:
          "Our own arithmetic, computed from the list prices in Exhibit A on 7 August 2026. The footprint is a stated assumption, not a measurement of any real customer: it is chosen to be modest and is shown precisely so the reader can substitute their own.",
      },
    },
    {
      t: "p",
      v: "The 15 to 40 percent band is reproducible, but only by choosing a token spend that produces it. That is the tell. Because these layers are overwhelmingly fixed, the uplift is a statement about the size of the denominator — about how much you spend on tokens — rather than a property of the vendor's pricing. A team spending five hundred dollars a month on tokens and running one forgotten fine-tune is not 30 percent over. They are nearly quadruple.",
    },
    {
      t: "p",
      v: "Which inverts the usual advice. The smaller the AI workload, the more the non-token layers dominate it, and the less useful a per-token comparison is for deciding anything. At real scale the opposite holds and the token rate is almost the whole bill. Both statements are true at once, and neither survives being compressed into a single percentage.",
    },
    { t: "h2", v: "What we do and do not measure" },
    {
      t: "p",
      v: "Our own connector reads token usage. It sees the meter it is pointed at, which is the token meter, and it does not see a support plan or a forgotten deployment sitting in a subscription we have no access to. So the honest scope of every saving we report is the token line, and that is what the methodology page says. We would rather state the boundary than let a per-token comparison quietly imply it covers the bill.",
    },
    {
      t: "p",
      v: "The practical version: before comparing per-token rates, list the non-token lines and check whether they are already larger than the difference you are optimising. Sometimes the cheapest available switch is deleting something nobody is calling.",
    },
    {
      t: "cta",
      headline:
        "Every figure we publish states its source, its date, and what it does not cover.",
      label: "How every figure is computed",
      to: "/legal/methodology",
    },
  ],
};

/**
 * Note 5 — why a one-time audit expires.
 *
 * This note deliberately does not re-argue Note 1's mechanism. Note 1 answers
 * "why did this specific number look wrong". This one answers the business
 * question underneath it: given that the number can change without anyone
 * touching anything, what follows about how often you have to look.
 *
 * It is labelled `correlated`, not `proven-mechanism`, and the reason is
 * stated inside the note itself. One of its three fronts is proven from our
 * own data, one is proven only as a mechanism, and one is reasoning we have
 * not measured. Labelling the whole piece on the strength of its best third
 * would be exactly the move the label discipline exists to prevent.
 */
const WHY_ONGOING: Note = {
  slug: "why-a-one-time-audit-expires",
  title: "An audit is a photograph of a market that keeps moving",
  deck: "Three separate things change your AI bill after the optimisation work is finished: the market, your own stack, and the setup you never touched. Only the first is widely accepted, and the third is the one nobody is watching.",
  description:
    "Why AI cost optimisation expires: prices move monthly, workloads mature, and an unchanged model ID can bill differently. What is proven, and what is not.",
  label: "correlated",
  month: null,
  published: "2026-08-07",
  minutes: 7,
  blocks: [
    {
      t: "p",
      v: "The standard shape of an AI cost engagement is connect, analyse, recommend, leave. It is a defensible shape for a market that holds still. The question this note asks is narrow and answerable: does this one hold still, and if not, along how many independent axes does it move?",
    },
    {
      t: "p",
      v: "Three. They are genuinely independent, in the sense that any one of them can move your bill while the other two do nothing. They also differ sharply in how well we can prove them, and that difference is the honest part of this note.",
    },
    { t: "h2", v: "One: the market moves, and this is the easy one to prove" },
    {
      t: "p",
      v: "Published prices change on a cadence measured in weeks, not years, and the changes are not drift — they are responses. A cheaper entrant forces a price cut; a flagship is quietly replaced by a stronger model at the same list price, which is a price cut expressed as capability rather than dollars. Our own price ledger is append-only precisely so this is a matter of record rather than recollection: every move we have ever observed is still there, with its date and its magnitude.",
    },
    {
      t: "p",
      v: "The consequence for a one-time audit is not that its recommendations were wrong. They were right on the day. It is that the ranking they were derived from is regenerated by the market every few weeks, and nothing about the audit updates when it does.",
    },
    { t: "h2", v: "Two: your own stack grows into a larger bill" },
    {
      t: "p",
      v: "As a team's use of AI matures, the work it asks of a model tends to get harder: longer context, more retrieved material, more tool calls per task, more steps before an answer. Spend per task rises without any provider changing anything and without anyone making a decision that looks like a spending decision.",
    },
    {
      t: "p",
      v: "We have not measured this on our own customer base, and we are not going to imply that we have. Our production usage history is not yet long enough to separate a maturing workload from a growing one, and a chart that cannot tell those apart is not evidence. Treat this front as reasonable and widely observed, not as something we have proven.",
    },
    { t: "h2", v: "Three: the setup you never touched changes underneath you" },
    {
      t: "p",
      v: "This is the front almost nobody watches, because everything visible about it stayed constant: same model identifier, same prompt, same code path. What can change is how many tokens the provider bills to answer it — through a silent update behind a stable model id, a shift in how much a reasoning model thinks by default, or a scaffolding change in the layer between your request and the weights.",
    },
    {
      t: "p",
      v: "The mechanism here is not speculative, and we have the artifact. A thinking model returned a one-word answer and billed sixty-eight output tokens. The billed number lives in a field that has nothing to do with the answer, so the answer can stay identical while the bill moves.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit A",
        title: "The billed number and the visible answer are different fields",
        lines: [
          '"usageMetadata": {',
          '  "promptTokenCount": 7,',
          '  "candidatesTokenCount": 1,',
          '  "thoughtsTokenCount": 67,',
          '  "totalTokenCount": 75',
          "}",
        ],
        caption:
          "Captured through the CostMyAI connector on a live generativelanguage.googleapis.com call, 7 August 2026, and pinned as a regression test the same day. Reproduced from the earlier note that first documented it; the mechanism, not the incident, is the point here.",
        sourcePath: "src/lib/ingest/__tests__/dispatch-109.test.ts",
      },
    },
    {
      t: "p",
      v: "What this exhibit proves is that the bill for an unchanged request is free to move without the answer moving. What it does not prove is that it did move for a given workload over a given period. That is a different claim, it needs the same task measured months apart, and we did not have those measurements.",
    },
    { t: "h2", v: "So we started taking them" },
    {
      t: "p",
      v: "From this month, eight fixed tasks run against six pinned models on the first of every month, and the token counts each provider reports are written to an append-only log. The tasks are frozen in source: a prompt may not be edited in place, and the fingerprint of the exact text sent is recorded on every row, so a prompt that was quietly changed shows up as a changed fingerprint rather than as drift. Failed calls are recorded as failures, so a gap in a series always states its reason.",
    },
    {
      t: "exhibit",
      v: {
        ref: "Exhibit B",
        title: "The instrument, as scheduled",
        lines: [
          "job          task-drift            monthly, 02:30 on the 1st",
          "tasks        8 frozen prompts      classification, extraction, summary,",
          "                                   rewrite, SQL, arithmetic, planning,",
          "                                   single tool-call decision",
          "models       6 pinned ids          3 Google, 3 OpenAI",
          "records      prompt + completion + reasoning tokens, upstream cost,",
          "             latency, SHA-256 of the prompt and of the reply",
          "storage      append-only; no row can be edited or deleted",
        ],
        caption:
          "The pinned set as committed on 7 August 2026. Two vendors, not the whole market: this is the set we can call on a fixed schedule with first-party credentials, and we would rather state the limit than imply coverage we do not have.",
        sourcePath: "src/lib/drift/tasks.ts",
      },
    },
    {
      t: "p",
      v: "There is no detector attached to it, and that is deliberate. One reading is not a series. A comparison written today would be a comparison nobody could test against real history, and shipping the alarm before the readings is how tools end up reporting movement they cannot substantiate. The meter runs; the comparison ships when there is something to compare.",
    },
    { t: "h2", v: "What each front actually justifies" },
    {
      t: "defs",
      items: [
        {
          term: "The market moves",
          text: "Proven from our own append-only price ledger. Justifies continuous monitoring on its own, without any of the rest.",
        },
        {
          term: "Your stack matures",
          text: "Reasoned, not measured by us. Plausible and widely reported, and we will not cite it as our finding until our own history is long enough to separate maturation from growth.",
        },
        {
          term: "The setup changes silently",
          text: "Mechanism proven, longitudinal case not yet ours. The exhibit shows the bill can move with the answer unchanged; the meter above is what will eventually show whether it does.",
        },
      ],
    },
    {
      t: "p",
      v: "One front is enough to answer the question. If prices move monthly and provably do, a recommendation set derived from last quarter's prices is a historical document, however good it was when it was written. The other two fronts do not change that conclusion. They change how much of it you can currently see.",
    },
    {
      t: "cta",
      headline:
        "Every figure we publish states its source, its date, and what it does not cover.",
      label: "How every figure is computed",
      to: "/legal/methodology",
    },
  ],
};

/** The corpus, newest first by convention rather than by requirement. */
export const NOTES: Note[] = [
  WHY_ONGOING,
  NON_TOKEN_COST_LAYERS,
  PRIMARY_SOURCE_VERIFICATION,
  EQUIVALENCE_VERDICTS,
  REASONING_OVERHEAD,
];



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
