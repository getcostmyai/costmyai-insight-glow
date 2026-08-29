import { TEST_EMAIL_DOMAINS } from "./customers";

/**
 * Why a partner application does, or does not, count as a real prospect.
 *
 * partner_applications carries no is_synthetic column (documented process
 * debt) — same manual-identification method already used for the customer
 * directory, applied to this table's actual shape: the automated
 * test-harness email domain, the founder's own "+"-tagged verification
 * alias, and a placeholder company name stamped with the same 13-digit
 * epoch suffix the automated test sweep already trusts as proof of
 * non-human origin.
 */
export type ApplicationVerdict = "real" | "test_harness" | "verification_drill";

const FOUNDER_VERIFICATION_LOCAL = "robin";
const FOUNDER_VERIFICATION_DOMAIN = "feine-biohonige.at";
const EPOCH_SUFFIX = /\s1[0-9]{12}$/;

export function classifyApplication(input: { email: string; company: string }): ApplicationVerdict {
  const email = (input.email ?? "").trim().toLowerCase();
  const [local, domain] = email.split("@");

  if ((TEST_EMAIL_DOMAINS as readonly string[]).includes(domain ?? "")) return "test_harness";

  if (domain === FOUNDER_VERIFICATION_DOMAIN && (local ?? "").split("+")[0] === FOUNDER_VERIFICATION_LOCAL) {
    return "verification_drill";
  }

  if (EPOCH_SUFFIX.test((input.company ?? "").trim())) return "test_harness";

  return "real";
}
