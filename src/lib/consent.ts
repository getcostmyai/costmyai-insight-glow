/**
 * Policy versions.
 *
 * The identifier is the human-readable "Last updated" date already printed at
 * the top of /terms and /privacy. No parallel versioning scheme: whatever a
 * customer can read on the page is exactly what gets recorded as accepted.
 * When either page's `updated` prop changes, change it here in the same edit.
 */
export const TERMS_VERSION = "2 August 2026";
export const PRIVACY_VERSION = "20 August 2026";

export type ConsentMethod = "password_signup" | "google_signup";
