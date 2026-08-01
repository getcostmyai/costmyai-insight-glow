import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level guards for the properties Robin's screenshots caught: a badge
 * stuck on one level, donuts and usage charts missing on some pages, a dead
 * nav item, and dollar figures that drifted between pages because two of them
 * read a live ticker instead of the snapshot.
 */
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const SHELL = read("components/dashboard/DashboardShell.tsx");
const LEVEL_FILES = {
  overview: read("components/dashboard/levels/OverviewLevel.tsx"),
  compare: read("components/dashboard/levels/CompareLevel.tsx"),
  certify: read("components/dashboard/levels/CertifyLevel.tsx"),
  rightsize: read("components/dashboard/levels/RightsizeLevel.tsx"),
  govern: read("components/dashboard/levels/GovernLevel.tsx"),
};

describe("dashboard shell", () => {
  it("names the level being viewed, not one hardcoded tier", () => {
    expect(SHELL).toContain("LEVELS.find((l) => l.key === level)?.label");
  });

  it("still shows the plan, labelled as the plan", () => {
    expect(SHELL).toContain("{data.workspace.plan} plan");
  });

  it("has no dead Workspace account link", () => {
    const account = SHELL.slice(SHELL.indexOf("const accountNav"), SHELL.indexOf("const ICONS"));
    expect(account).not.toContain('label: "Workspace"');
    expect(account).toContain('to: "/settings"');
  });
});

describe("every level page", () => {
  it("renders the captured/available donut", () => {
    for (const [name, src] of Object.entries(LEVEL_FILES)) {
      // Govern renders the mode control in its hero aside instead of the ring,
      // but inherits Rightsize's sections below it.
      if (name === "govern") continue;
      expect(src, name).toContain("<SavingsRing");
    }
  });

  it("renders the gateway usage chart", () => {
    for (const [name, src] of Object.entries(LEVEL_FILES)) {
      expect(src, name).toContain("<UsageSection ctl={ctl} />");
    }
  });
});

describe("cross-page dollar parity", () => {
  it("reads window spend from the snapshot, never the live ticker", () => {
    expect(LEVEL_FILES.overview).not.toContain("live.spend");
    expect(LEVEL_FILES.compare).not.toContain("live.spend");
    expect(LEVEL_FILES.overview).toContain("data.totals.spend");
    expect(LEVEL_FILES.compare).toContain("data.totals.spend");
  });

  it("takes the donut figures from one shared savings object", () => {
    for (const name of ["overview", "compare", "certify", "rightsize"] as const) {
      expect(LEVEL_FILES[name], name).toMatch(/SavingsRing[\s\S]{0,120}activeMonthly/);
    }
  });
});

describe("level-appropriate copy", () => {
  it("keeps paid-tier capture language off the free Compare page", () => {
    expect(LEVEL_FILES.compare).not.toContain("Already captured");
  });

  it("keeps Overview level-neutral", () => {
    expect(LEVEL_FILES.overview).not.toContain("rightsize plan");
    expect(LEVEL_FILES.overview).toContain("Across every check your workspace runs");
  });

  it("explains arbitrage versus benchmark saving on Certify", () => {
    expect(LEVEL_FILES.certify).toContain("Same model, cheaper host — no benchmark needed");
    expect(LEVEL_FILES.certify).toContain("Different model, quality proven before it is shown");
  });

  it("labels both numbers on an active switch", () => {
    expect(LEVEL_FILES.rightsize).toContain("Run rate");
    expect(LEVEL_FILES.rightsize).toContain("Captured to date");
  });

  it("gives Govern the full Rightsize content plus a mode toggle", () => {
    expect(LEVEL_FILES.govern).toContain("<OversizedSection ctl={ctl} />");
    expect(LEVEL_FILES.govern).toContain("<ActiveSwitchesSection ctl={ctl} />");
    expect(LEVEL_FILES.govern).toContain('role="radiogroup"');
  });

  it("surfaces the real next-level finding as the upsell", () => {
    expect(LEVEL_FILES.compare).toContain("<NextLevelUpsell");
    expect(LEVEL_FILES.certify).toContain("<NextLevelUpsell");
  });
});
