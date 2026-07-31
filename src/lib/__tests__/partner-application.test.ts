import { describe, expect, it } from "vitest";

import {
  ACTIVE_CLIENT_BUCKETS,
  STARTING_SOON_BUCKETS,
  isConsumerEmail,
  normalizeContact,
  routeApplication,
  validateContact,
} from "../partner-application";

const contact = {
  firstName: "Robin",
  lastName: "Müller",
  email: "robin@agency.io",
  phone: "+43 660 1234567",
  company: "Agency GmbH",
};

describe("routing", () => {
  it("sends practices of 101+ active clients to a meeting", () => {
    for (const bucket of ["101–300", "301–1,000", "1,000+"] as const) {
      expect(routeApplication(bucket, "0")).toEqual({ path: "meeting", escalated: false });
    }
  });

  it("sends smaller practices with no near-term pipeline to the async queue", () => {
    for (const bucket of ["0", "1–10", "11–50", "51–100"] as const) {
      expect(routeApplication(bucket, "0")).toEqual({ path: "async", escalated: false });
      expect(routeApplication(bucket, "1")).toEqual({ path: "async", escalated: false });
    }
  });

  it("escalates a small practice with two or more clients starting in three weeks", () => {
    expect(routeApplication("0", "2")).toEqual({ path: "meeting", escalated: true });
    expect(routeApplication("11–50", "3+")).toEqual({ path: "meeting", escalated: true });
    expect(routeApplication("51–100", "2")).toEqual({ path: "meeting", escalated: true });
  });

  it("does not mark an at-scale practice as escalated even with strong pipeline", () => {
    expect(routeApplication("1,000+", "3+")).toEqual({ path: "meeting", escalated: false });
  });

  it("covers every bucket combination with a decision", () => {
    for (const a of ACTIVE_CLIENT_BUCKETS) {
      for (const s of STARTING_SOON_BUCKETS) {
        expect(["meeting", "async"]).toContain(routeApplication(a, s).path);
      }
    }
  });
});

describe("contact validation", () => {
  it("accepts a complete business contact", () => {
    expect(validateContact(contact)).toEqual({});
  });

  it("rejects consumer mailboxes", () => {
    expect(isConsumerEmail("robin@gmail.com")).toBe(true);
    expect(isConsumerEmail("robin@agency.io")).toBe(false);
    expect(validateContact({ ...contact, email: "robin@gmail.com" }).email).toMatch(/business/i);
  });

  it("flags every missing field", () => {
    const errors = validateContact({});
    expect(Object.keys(errors).sort()).toEqual([
      "company",
      "email",
      "firstName",
      "lastName",
      "phone",
    ]);
  });

  it("rejects a malformed email and an unusable phone", () => {
    expect(validateContact({ ...contact, email: "nope" }).email).toBeDefined();
    expect(validateContact({ ...contact, phone: "12" }).phone).toBeDefined();
  });

  it("normalises whitespace and lowercases the email", () => {
    expect(
      normalizeContact({ ...contact, firstName: "  Robin ", email: " Robin@Agency.IO " }),
    ).toMatchObject({ firstName: "Robin", email: "robin@agency.io" });
  });
});
