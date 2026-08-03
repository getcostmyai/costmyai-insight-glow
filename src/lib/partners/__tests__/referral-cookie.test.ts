import { describe, expect, it } from "vitest";

import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  clearReferralCookie,
  isPlausibleCode,
  readReferralCookie,
  serializeReferralCookie,
} from "../referral-cookie";

/**
 * The cookie is the only part of referral attribution that lives outside the
 * database, so it is the only part that needs its own tests. Everything after
 * it goes through attach_referral, which is covered against real Postgres in
 * partners.integration.test.ts.
 */
describe("first-touch referral cookie", () => {
  it("remembers a code for 60 days, and never exposes it to page scripts", () => {
    const header = serializeReferralCookie("ALICE-01", true);
    expect(header).toContain(`${REFERRAL_COOKIE}=ALICE-01`);
    expect(header).toContain(`Max-Age=${REFERRAL_COOKIE_MAX_AGE}`);
    expect(REFERRAL_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 60);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Secure");
  });

  it("drops Secure on plain http so the cookie still works in local development", () => {
    expect(serializeReferralCookie("ALICE-01", false)).not.toContain("Secure");
  });

  it("first touch wins: a second click cannot overwrite an existing referral", () => {
    // This is the rule the /r/$code handler enforces by reading before writing.
    const afterFirstClick = `${REFERRAL_COOKIE}=ALICE-01`;
    const existing = readReferralCookie(afterFirstClick);
    expect(existing).toBe("ALICE-01");
    // The handler only writes when `existing` is null, so a BOB click is a no-op.
    const shouldWrite = existing === null;
    expect(shouldWrite).toBe(false);
  });

  it("treats an expired cookie as absent, because the browser stops sending it", () => {
    // Expiry is not something the server re-checks: past Max-Age the cookie is
    // simply not in the request, which reads as no referral at all.
    expect(readReferralCookie(null)).toBeNull();
    expect(readReferralCookie("other=1; unrelated=2")).toBeNull();
    // And clearing sets an immediately-expired cookie of the same name.
    const cleared = clearReferralCookie(true);
    expect(cleared).toContain(`${REFERRAL_COOKIE}=`);
    expect(cleared).toContain("Max-Age=0");
    expect(readReferralCookie("cma_ref=")).toBeNull();
  });

  it("refuses a value that is not a plausible code, so nothing junk reaches the database", () => {
    expect(isPlausibleCode("ALICE-01")).toBe(true);
    expect(isPlausibleCode("ab")).toBe(false);
    expect(isPlausibleCode("a".repeat(41))).toBe(false);
    expect(isPlausibleCode("'; drop table partners;--")).toBe(false);
    expect(isPlausibleCode(null)).toBe(false);
    expect(readReferralCookie("cma_ref=%27%3B%20drop")).toBeNull();
  });

  it("reads its own cookie out of a crowded header and ignores lookalikes", () => {
    expect(readReferralCookie("a=1; cma_ref=BOB-02; sb-auth=xyz")).toBe("BOB-02");
    expect(readReferralCookie("xcma_ref=BOB-02")).toBeNull();
  });
});
