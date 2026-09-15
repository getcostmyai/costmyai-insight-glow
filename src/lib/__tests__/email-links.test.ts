/**
 * Outbound links are the one class of URL we cannot correct after the fact.
 * Once an email is delivered, whatever host it printed is permanent, so these
 * tests assert both the built strings and the structural rule that nothing in
 * an email path may derive an origin from anywhere else.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OUTBOUND_ORIGIN,
  feedbackPostUrl,
  newsletterArchiveUrl,
  newsletterConfirmUrl,
  newsletterUnsubscribeUrl,
  partnerApplicationsReviewUrl,
  partnerLoginUrl,
  partnerReferralUrl,
  partnerVerifyUrl,
} from "../email-links";
import { PUBLIC_SITE_ORIGIN } from "../public-origin";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

describe("outbound email links", () => {
  it("are all built from the pinned production origin", () => {
    expect(OUTBOUND_ORIGIN).toBe(PUBLIC_SITE_ORIGIN);
    expect(OUTBOUND_ORIGIN).toBe("https://www.costmyai.com");

    expect(partnerLoginUrl()).toBe("https://www.costmyai.com/partner/login");
    expect(partnerReferralUrl("VINCENT")).toBe("https://www.costmyai.com/r/VINCENT");
    expect(partnerVerifyUrl("vincent")).toBe("https://www.costmyai.com/partner/verify/VINCENT");
    expect(partnerApplicationsReviewUrl()).toBe(
      "https://www.costmyai.com/admin/partner-applications",
    );
    expect(newsletterConfirmUrl("tok")).toBe(
      "https://www.costmyai.com/newsletter/confirm?token=tok",
    );
    expect(newsletterUnsubscribeUrl("tok")).toBe(
      "https://www.costmyai.com/newsletter/unsubscribe?token=tok",
    );
    expect(newsletterArchiveUrl()).toBe("https://www.costmyai.com/intelligence");
    expect(feedbackPostUrl("abc")).toBe("https://www.costmyai.com/feedback/abc");
  });

  it("keeps an unsubscribe link resolvable even with no token", () => {
    expect(newsletterUnsubscribeUrl(null)).toBe("https://www.costmyai.com/newsletter/unsubscribe");
    expect(newsletterUnsubscribeUrl()).toBe("https://www.costmyai.com/newsletter/unsubscribe");
  });

  it("escapes a token rather than pasting it raw into the query string", () => {
    expect(newsletterConfirmUrl("a b&c")).toBe(
      "https://www.costmyai.com/newsletter/confirm?token=a%20b%26c",
    );
  });
});

describe("no email path can reintroduce a preview or request origin", () => {
  // The preview harness is the one legitimate place a preview host appears: it
  // renders sample emails for a human, it never sends one.
  const ALLOWED = [
    join(SRC, "routes", "lovable", "email", "auth", "preview.ts"),
    join(SRC, "integrations", "supabase", "previewAuthStorage.ts"),
    join(SRC, "lib", "public-origin.ts"),
  ];

  const files = walk(SRC).filter((f) => !ALLOWED.includes(f));

  it("has no lovable.app host anywhere in shipped code", () => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes("lovable.app"));
    expect(offenders).toEqual([]);
  });

  it("has no SITE_ORIGIN environment variable left to be unset", () => {
    const offenders = files.filter((f) => /process\.env\[?["']?\w*SITE_ORIGIN/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("builds every link in an email template from the shared helpers", () => {
    const templates = walk(join(SRC, "lib", "email-templates"));
    const offenders = templates.filter((f) => {
      const body = readFileSync(f, "utf8");
      // A literal http(s) default inside a template is exactly the shape that
      // silently shipped a preview link into a partner's inbox.
      const literals = body.match(/=\s*'https?:\/\/[^']+'/g) ?? [];
      return literals.some((l) => !l.includes("www.costmyai.com"));
    });
    expect(offenders).toEqual([]);
  });
});
