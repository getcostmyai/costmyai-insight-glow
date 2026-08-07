/**
 * The pinned task set.
 *
 * This file is the instrument, and an instrument is only an instrument if it
 * does not move. Every string below is frozen: a task's prompt may never be
 * edited in place, because a measurement taken in November against an edited
 * prompt is not comparable to one taken in August, and a series that quietly
 * changed its own definition is worse than no series at all.
 *
 * If a task genuinely needs to change, add a new task with a new id and retire
 * the old one by setting `retired`. The old series stays intact and keeps its
 * meaning; the new one starts its own history. `revision` exists only so that
 * an accidental edit is visible in the data rather than invisible — the
 * capture job records the SHA-256 of the exact prompt it sent, so a changed
 * prompt shows up as a changed fingerprint on the row, not as drift.
 *
 * What this measures: for a fixed task and a fixed model id, how many tokens
 * does the provider bill, month over month. Nothing here measures quality, and
 * nothing here is a benchmark. It is a meter reading on an unchanging load.
 */

export interface DriftTask {
  /** Stable forever. Never reuse an id for different content. */
  id: string;
  label: string;
  /** Why this task is in the set — what class of work it stands in for. */
  rationale: string;
  /** Sent verbatim as the single user message. Frozen. */
  prompt: string;
  /** Bumped only if the prompt above is ever edited. Should stay 1. */
  revision: number;
  retired?: boolean;
}

/**
 * The pinned models.
 *
 * Two vendors, three tiers each, addressed by their exact published model id
 * through the AI gateway. This is deliberately narrow and we say so publicly:
 * it is the set we can call on a fixed schedule with first-party credentials,
 * not a claim about the whole market.
 */
export interface DriftModel {
  /** The exact id sent to the gateway. Frozen. */
  key: string;
  vendor: string;
  label: string;
  retired?: boolean;
}

export const DRIFT_MODELS: DriftModel[] = [
  { key: "google/gemini-2.5-flash", vendor: "google", label: "Gemini 2.5 Flash" },
  { key: "google/gemini-3-flash-preview", vendor: "google", label: "Gemini 3 Flash" },
  { key: "google/gemini-3.1-pro-preview", vendor: "google", label: "Gemini 3.1 Pro" },
  { key: "openai/gpt-5-mini", vendor: "openai", label: "GPT-5 mini" },
  { key: "openai/gpt-5.4", vendor: "openai", label: "GPT-5.4" },
  { key: "openai/gpt-5.6-sol", vendor: "openai", label: "GPT-5.6 Sol" },
];

export const DRIFT_TASKS: DriftTask[] = [
  {
    id: "classify-support-ticket",
    label: "Classify a support ticket",
    rationale:
      "The cheapest, highest-volume shape in production AI: a short input, a one-word answer, no room for a model to talk itself into a longer reply.",
    revision: 1,
    prompt:
      'Classify this support ticket into exactly one of: billing, bug, feature_request, account_access, other. Answer with the single category word and nothing else.\n\nTicket: "I was charged twice for the March invoice and the second charge is still showing as pending on my card."',
  },
  {
    id: "extract-invoice-fields",
    label: "Extract fields into strict JSON",
    rationale:
      "Structured extraction, where output length is bounded by a schema. If billed output grows here, it did not grow because the task asked for more.",
    revision: 1,
    prompt:
      'Extract the following fields from the text as a single JSON object with exactly these keys: vendor, invoice_number, currency, total. Output only the JSON, with no code fence and no commentary.\n\nText: "Northwind Cloud Services — Invoice NW-2291 issued 4 March. Amount due: EUR 1,482.30, payable within 30 days."',
  },
  {
    id: "summarise-fixed-paragraph",
    label: "Summarise a fixed paragraph in one sentence",
    rationale:
      "The most common summarisation shape, with an explicit length cap. A cap is exactly the kind of instruction a scaffolding change can start interpreting differently.",
    revision: 1,
    prompt:
      "Summarise the following paragraph in exactly one sentence of no more than 25 words. Output only the sentence.\n\nParagraph: The finance team had assumed that the cost of the assistant would fall as the provider cut its published prices, and for two months it did. In the third month the published price fell again but the invoice rose, because the average number of tokens the assistant produced per conversation had grown faster than the price had fallen.",
  },
  {
    id: "rewrite-tone",
    label: "Rewrite a message in a required tone",
    rationale:
      "An open-ended generation task with no length instruction at all. This is where a default-length or verbosity change should surface first.",
    revision: 1,
    prompt:
      'Rewrite the following message so it is polite and professional, keeping every fact unchanged.\n\nMessage: "Your invoice is wrong again. This is the third month running and nobody has replied to either of my emails. Fix it."',
  },
  {
    id: "sql-from-question",
    label: "Write one SQL statement",
    rationale:
      "Code generation with a single correct shape. Cheap for a strong model, and a fair test of whether a model starts explaining itself when it previously did not.",
    revision: 1,
    prompt:
      "Write a single PostgreSQL statement, and nothing else, that returns the ten customers with the highest total order value in 2025. Tables: customers(id, name), orders(id, customer_id, placed_at, total_usd).",
  },
  {
    id: "arithmetic-word-problem",
    label: "Solve a small arithmetic word problem",
    rationale:
      "A short problem with a single numeric answer. The clearest place to see reasoning-token defaults change, because the visible answer cannot get longer than a number.",
    revision: 1,
    prompt:
      "A team sends 4,200 requests a day. Each request averages 900 input tokens and 260 output tokens. Input costs $3.00 per million tokens and output costs $15.00 per million tokens. What is the cost for a 30-day month? Answer with the dollar figure only.",
  },
  {
    id: "multi-step-plan",
    label: "Produce a fixed-length plan",
    rationale:
      "A deliberately reasoning-heavy task with an explicit output cap, so any growth in billed tokens is growth in thinking rather than growth in the deliverable.",
    revision: 1,
    prompt:
      "A company spends $40,000 a month across three model providers and has no per-team attribution. Give exactly five numbered steps to get to per-team attribution within one quarter. One line per step, no preamble, no closing remarks.",
  },
  {
    id: "tool-call-decision",
    label: "Decide a single tool call",
    rationale:
      "The agent shape. An agent's bill is driven by how many turns it takes, and a turn begins with a decision exactly like this one.",
    revision: 1,
    prompt:
      'You have exactly two tools: get_invoice(invoice_id) and refund(charge_id, amount_usd). A customer says: "I was double charged on invoice NW-2291." Respond with a single line of JSON naming the one tool you would call first and its arguments. No explanation.',
  },
];

export const activeTasks = (): DriftTask[] => DRIFT_TASKS.filter((t) => !t.retired);
export const activeModels = (): DriftModel[] => DRIFT_MODELS.filter((m) => !m.retired);

/** How many observations a complete monthly run is expected to write. */
export const expectedObservations = (): number => activeTasks().length * activeModels().length;
