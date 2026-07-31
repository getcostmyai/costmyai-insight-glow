import { describe, expect, it } from "vitest";

import { slugify, suggestWorkspaceName, validateWorkspaceName } from "../naming";

describe("slugify", () => {
  it("mirrors the database slug rules", () => {
    expect(slugify("Acme AI")).toBe("acme-ai");
    expect(slugify("  Örsted & Co.  ")).toBe("rsted-co");
  });

  it("never produces an empty slug", () => {
    expect(slugify("!!!")).toBe("workspace");
  });
});

describe("suggestWorkspaceName", () => {
  it("uses the company domain when there is one", () => {
    expect(suggestWorkspaceName("ada@acme.io")).toBe("Acme");
  });

  it("does not name a workspace after a mailbox provider", () => {
    expect(suggestWorkspaceName("ada@gmail.com")).toBe("Ada's workspace");
    expect(suggestWorkspaceName("ada.lovelace@icloud.com", "Ada Lovelace")).toBe("Ada's workspace");
  });

  it("falls back when there is no identity at all", () => {
    expect(suggestWorkspaceName(null)).toBe("My workspace");
  });
});

describe("validateWorkspaceName", () => {
  it("accepts a normal name", () => {
    expect(validateWorkspaceName("Acme")).toBeNull();
  });

  it("rejects empty, too short, and too long names", () => {
    expect(validateWorkspaceName("   ")).toMatch(/name/i);
    expect(validateWorkspaceName("A")).toMatch(/short/i);
    expect(validateWorkspaceName("x".repeat(61))).toMatch(/60/);
  });
});
