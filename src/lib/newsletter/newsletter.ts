/**
 * Newsletter primitives shared by the server functions, the tests and (later)
 * the signup UI. Nothing here touches the database or `process.env`, so it is
 * safe to import from a client component.
 */

/** Same shape the partner application uses — deliberately permissive, not an RFC parser. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_EMAIL_LENGTH = 200;
export const MAX_SOURCE_LENGTH = 60;

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed" | "bounced";

/** Lowercased and trimmed — the unique index is on `lower(email)`, so storage must match. */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidEmail(raw: unknown): boolean {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL.test(email);
}

/**
 * Where the signup happened. Free text from the page, so it is clamped to a
 * short slug-ish value: this string is only ever read by us, and an unbounded
 * one would turn the form into a write channel.
 */
export function normalizeSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const source = raw.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "-").slice(0, MAX_SOURCE_LENGTH);
  return source || null;
}

/**
 * 32 bytes of CSPRNG entropy, hex encoded. Guessing one is not a realistic
 * attack, which matters because this token both confirms a subscription and
 * (after rotation) unsubscribes one without any other authentication.
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isPlausibleToken(raw: unknown): boolean {
  return typeof raw === "string" && /^[0-9a-f]{64}$/.test(raw.trim());
}
