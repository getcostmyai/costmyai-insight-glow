/**
 * Naming helpers for workspace onboarding.
 *
 * Pure functions so the defaults a new user sees can be tested without an
 * account. The authoritative slug is generated in the database (it has to be,
 * to stay unique under concurrent signups) — this mirrors the same rules so the
 * UI can show an honest preview instead of a guess.
 */

/** Same transformation as public.create_organization's slug generator. */
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "workspace" : base;
}

/**
 * A first workspace name derived from the sign-up identity.
 *
 * Company domains become the company name; consumer mailbox providers do not,
 * because "Gmail" is not the name of anyone's company.
 */
const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.de",
  "web.de",
]);

export function suggestWorkspaceName(email: string | null | undefined, fullName?: string | null): string {
  const domain = email?.split("@")[1]?.toLowerCase() ?? "";
  const label = domain.split(".")[0] ?? "";
  if (domain && !CONSUMER_DOMAINS.has(domain) && label.length > 1) {
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const person = (fullName ?? email?.split("@")[0] ?? "").trim();
  if (person) {
    const first = person.split(/[\s._-]+/)[0];
    return `${first.charAt(0).toUpperCase() + first.slice(1)}'s workspace`;
  }
  return "My workspace";
}

/** Workspace names are shown next to money — reject the ones that break trust. */
export function validateWorkspaceName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Give the workspace a name.";
  if (trimmed.length < 2) return "That name is too short.";
  if (trimmed.length > 60) return "Keep the name under 60 characters.";
  return null;
}
