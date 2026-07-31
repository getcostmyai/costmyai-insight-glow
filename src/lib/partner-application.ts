/**
 * Partner application: buckets, routing rule and validation.
 *
 * Pure and client-safe on purpose — the browser uses exactly the same rule the
 * server re-applies before writing, so a hand-crafted request cannot buy itself
 * a meeting slot it did not qualify for.
 */

export const ACTIVE_CLIENT_BUCKETS = [
  "0",
  "1–10",
  "11–50",
  "51–100",
  "101–300",
  "301–1,000",
  "1,000+",
] as const;
export type ActiveClientBucket = (typeof ACTIVE_CLIENT_BUCKETS)[number];

/** The rungs that clear the scale threshold on their own. */
export const AT_SCALE_BUCKETS: readonly ActiveClientBucket[] = ["101–300", "301–1,000", "1,000+"];

export const STARTING_SOON_BUCKETS = ["0", "1", "2", "3+"] as const;
export type StartingSoonBucket = (typeof STARTING_SOON_BUCKETS)[number];

/** Near-term pipeline strong enough to escalate a smaller practice. */
export const STRONG_PIPELINE_BUCKETS: readonly StartingSoonBucket[] = ["2", "3+"];

export type ApplicationPath = "meeting" | "async";

export interface Routing {
  path: ApplicationPath;
  /** True when the pipeline answer — not the client count — earned the meeting. */
  escalated: boolean;
}

/**
 * 101+ active clients books a meeting. So does a smaller practice with two or
 * more clients likely to start within three weeks: near-term pipeline is as
 * real a signal as current scale.
 */
export function routeApplication(
  activeClients: ActiveClientBucket,
  startingSoon: StartingSoonBucket,
): Routing {
  const atScale = AT_SCALE_BUCKETS.includes(activeClients);
  const strongPipeline = STRONG_PIPELINE_BUCKETS.includes(startingSoon);
  if (atScale) return { path: "meeting", escalated: false };
  if (strongPipeline) return { path: "meeting", escalated: true };
  return { path: "async", escalated: false };
}

export interface ApplicantContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
}

export interface ApplicationInput extends ApplicantContact {
  activeClients: ActiveClientBucket;
  startingSoon: StartingSoonBucket;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\-.\s\d]{6,25}$/;

/** Free-consumer-mailbox check: this is a business partner program. */
const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "proton.me",
  "protonmail.com",
]);

export function isConsumerEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return CONSUMER_DOMAINS.has(domain);
}

export type FieldErrors = Partial<Record<keyof ApplicantContact, string>>;

/** Field-level validation, shared by the form and the server handler. */
export function validateContact(contact: Partial<ApplicantContact>): FieldErrors {
  const errors: FieldErrors = {};
  const first = (contact.firstName ?? "").trim();
  const last = (contact.lastName ?? "").trim();
  const email = (contact.email ?? "").trim();
  const phone = (contact.phone ?? "").trim();
  const company = (contact.company ?? "").trim();

  if (first.length < 2 || first.length > 80) errors.firstName = "Please enter your first name";
  if (last.length < 2 || last.length > 80) errors.lastName = "Please enter your last name";
  if (!EMAIL.test(email) || email.length > 200) errors.email = "Please enter a valid email address";
  else if (isConsumerEmail(email)) errors.email = "Please use your business email address";
  if (!PHONE.test(phone)) errors.phone = "Please enter a reachable phone number";
  if (company.length < 2 || company.length > 120) errors.company = "Please enter your company name";

  return errors;
}

export function normalizeContact(contact: ApplicantContact): ApplicantContact {
  return {
    firstName: contact.firstName.trim().slice(0, 80),
    lastName: contact.lastName.trim().slice(0, 80),
    email: contact.email.trim().toLowerCase().slice(0, 200),
    phone: contact.phone.trim().slice(0, 25),
    company: contact.company.trim().slice(0, 120),
  };
}

export function isActiveClientBucket(v: unknown): v is ActiveClientBucket {
  return ACTIVE_CLIENT_BUCKETS.includes(v as ActiveClientBucket);
}

export function isStartingSoonBucket(v: unknown): v is StartingSoonBucket {
  return STARTING_SOON_BUCKETS.includes(v as StartingSoonBucket);
}

/** How long a human review actually takes — stated once, used everywhere. */
export const REVIEW_TURNAROUND = "3 business days";

export const APPLICATION_STATUSES = ["pending", "reviewed", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
