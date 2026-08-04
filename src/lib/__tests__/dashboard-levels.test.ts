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
const SIDEBAR = read("components/dashboard/DashboardSidebar.tsx");
const ACCOUNT_SHELL = read("components/dashboard/AccountShell.tsx");
const ACCOUNT_PAGES = {
  settings: read("routes/_authenticated/settings.tsx"),
  team: read("routes/_authenticated/team.tsx"),
  billing: read("routes/_authenticated/billing.tsx"),
};
const LEVEL_FILES = {
  overview: read("components/dashboard/levels/OverviewLevel.tsx"),
  compare: read("components/dashboard/levels/CompareLevel.tsx"),
  certify: read("components/dashboard/levels/CertifyLevel.tsx"),
  rightsize: read("components/dashboard/levels/RightsizeLevel.tsx"),
  govern: read("components/dashboard/levels/GovernLevel.tsx"),
};

describe("dashboard shell", () => {
  it("names the level being viewed, not one hardcoded tier", () => {
    expect(SIDEBAR).toContain("LEVELS.find((l) => l.key === level)?.label");
  });

  it("still shows the plan, labelled as the plan", () => {
    expect(SIDEBAR).toContain("{plan} plan");
  });

  it("has no dead Workspace account link", () => {
    expect(SIDEBAR).not.toContain('label: "Workspace"');
    expect(SIDEBAR).toContain('to: "/settings"');
    expect(SIDEBAR).toContain('to: "/billing"');
    expect(SIDEBAR).toContain('to: "/team"');
  });

  it("keeps one sidebar implementation shared by levels and account pages", () => {
    expect(SHELL).toContain("<DashboardSidebar");
    expect(ACCOUNT_SHELL).toContain("<DashboardSidebar");
  });
});

describe("account subpages keep the dashboard sidebar", () => {
  for (const [name, src] of Object.entries(ACCOUNT_PAGES)) {
    it(`${name} renders inside AccountShell`, () => {
      expect(src).toContain("<AccountShell");
    });
  }

  it("billing shows the real subscription, receipts and a way back", () => {
    expect(ACCOUNT_PAGES.billing).toContain("listWorkspaceInvoices");
    expect(ACCOUNT_PAGES.billing).toContain("createBillingPortal");
    expect(ACCOUNT_PAGES.billing).toContain("Invoice history");
    expect(ACCOUNT_PAGES.billing).toContain("Back to dashboard");
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
  it("reads window spend from the one shared ticker the usage widget uses", () => {
    // The hero card and the Gateway Usage widget disagreed by cents because
    // each mounted its own ticker. Both now read controller-owned `live`.
    expect(SHELL).toContain("usd(live.spend)");
    for (const name of ["overview", "compare", "certify", "rightsize", "govern"] as const) {
      expect(LEVEL_FILES[name], name).toContain("live.spend");
    }
    expect(read("components/dashboard/useDashboardController.ts")).toContain("useLiveTotals");
  });

  it("takes the donut figures from one shared, window-scoped savings object", () => {
    for (const name of ["overview", "compare", "certify", "rightsize"] as const) {
      expect(LEVEL_FILES[name], name).toMatch(/SavingsRing[\s\S]{0,160}savings\.captured/);
      expect(LEVEL_FILES[name], name).toMatch(/SavingsRing[\s\S]{0,220}savings\.available/);
    }
  });

  it("never renders a monthly run-rate as if it were the period figure", () => {
    // The audit: shorter windows showed bigger money because the lists summed
    // 30-day projections. No level page may read a *Monthly saving field.
    for (const name of ["overview", "compare", "certify", "rightsize", "govern"] as const) {
      expect(LEVEL_FILES[name], name).not.toMatch(/savings\.(activeMonthly|availableMonthly|lockedMonthly)/);
      expect(LEVEL_FILES[name], name).not.toMatch(/r\.monthlySaving|c\.monthlySaving/);
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

  it("surfaces the real next-level finding once, at the top of the page", () => {
    // One upsell per page: the duplicate banner at the bottom of Compare and
    // Certify repeated the same number twice on one screen.
    expect(LEVEL_FILES.compare).toContain("<HeroUpsell");
    expect(LEVEL_FILES.certify).toContain("<HeroUpsell");
    expect(LEVEL_FILES.compare).not.toContain("<NextLevelUpsell");
    expect(LEVEL_FILES.certify).not.toContain("<NextLevelUpsell");
  });
});

/**
 * Round 3 fix spec. One test per numbered item so a regression names itself.
 */
const PRIMITIVES = read("components/dashboard/primitives.tsx");
const LISTS = read("components/dashboard/TransparencyLists.tsx");
const SHELL_R3 = read("components/dashboard/DashboardShell.tsx");

describe("round 3 spec", () => {
  it("item 2 · Certify and Rightsize heroes carry the windowed spend figure", () => {
    for (const name of ["certify", "rightsize"] as const) {
      expect(LEVEL_FILES[name], name).toMatch(
        /label=\{`Spend · \$\{activeRange\.long\}`\}[\s\S]{0,80}usd\(live\.spend\)/,
      );
    }
  });

  it("item 3 · Govern hero shows Rightsize's KPI row plus its own", () => {
    const rows = LEVEL_FILES.govern.match(/<HeroStatRow/g) ?? [];
    expect(rows.length).toBe(2);
    for (const label of [
      "Active saving",
      "Available to activate",
      // Round 4 renamed the oversized card to the mechanism it is —
      // "Rightsize saving" — and moved it into the shared MechanismStats.
      "Savings captured",
      "Frozen",
      "Running unattended",
      "Eligible now",
      "Held for you",
      "Minimum to act",
      "Cooldown",
    ]) {
      expect(LEVEL_FILES.govern, label).toContain(label);
    }
  });

  it("item 4 · Certify and Rightsize render lists A, B and C", () => {
    expect(LISTS).toContain("List A · arbitrage saves");
    expect(LISTS).toContain("List B · benchmark saves");
    expect(LISTS).toContain("List C · nothing worth switching");
    expect(LEVEL_FILES.rightsize).toContain("<TransparencyLists ctl={ctl} />");
    // Certify renders it in discovery mode; the prop is allowed to vary, the
    // component being on the page is what this test is about.
    expect(LEVEL_FILES.certify).toMatch(/<ArbitrageList ctl=\{ctl\}/);
    expect(LEVEL_FILES.certify).toContain("List B · benchmark saves");
    expect(LEVEL_FILES.certify).toContain("<NonQualifyingList ctl={ctl} />");
  });

  it("item 4 · List C prints the engine's own verdict per row, not one canned line", () => {
    // r.label / r.detail come straight from the certification verdict on the
    // server; a hardcoded refusal sentence here would be invented copy.
    expect(LISTS).toMatch(/\{r\.label\}/);
    expect(LISTS).toMatch(/\{r\.detail\}/);
  });

  it("item 5 · Rightsize puts the manual switch control in the hero", () => {
    expect(LEVEL_FILES.rightsize).toMatch(
      /<LevelHero[\s\S]*<TopSwitchControl ctl=\{ctl\} \/>[\s\S]*<\/LevelHero>/,
    );
    expect(LEVEL_FILES.rightsize).toContain("Switch now");
  });

  it("item 6 · every switchable row carries its own activate action", () => {
    const activates = LISTS.match(/onActivate=/g) ?? [];
    expect(activates.length).toBe(2); // lists A and B
    expect(LISTS).toContain("activate.mutate(");
    expect(LEVEL_FILES.rightsize).toMatch(/activate\.mutate\(/); // oversized rows
  });

  it("item 7 · Govern is Rightsize plus autonomy", () => {
    expect(LEVEL_FILES.govern).toContain("<TransparencyLists ctl={ctl} />");
    expect(LEVEL_FILES.govern).toContain("<TopSwitchControl ctl={ctl} />");
    expect(LEVEL_FILES.govern).toContain("<OversizedSection ctl={ctl} />");
    expect(LEVEL_FILES.govern).toContain('role="radiogroup"');
  });

  it("item 8 · the next-level upsell is a hero-area banner with the real number", () => {
    for (const name of ["compare", "certify"] as const) {
      expect(LEVEL_FILES[name], name).toMatch(
        /<HeroUpsell[\s\S]{0,320}saving=\{[\s\S]{0,40}\}/,
      );
      // Placed directly after the hero, before the usage chart.
      const upsell = LEVEL_FILES[name].indexOf("<HeroUpsell");
      const usage = LEVEL_FILES[name].indexOf("<UsageSection");
      expect(upsell, name).toBeGreaterThan(-1);
      expect(upsell, name).toBeLessThan(usage);
    }
  });

  it("item 9 · workspace nav is upsell-only, demo shows all five levels", () => {
    expect(SIDEBAR).toContain('scope === "demo"\n      ? LEVELS');
    expect(SIDEBAR).toContain("planAtLeast(meta.requiredPlan, plan)");
  });

  it("item 11 · hero stat cards share one baseline per row via subgrid", () => {
    expect(PRIMITIVES).toContain("row-span-3 grid min-w-0 grid-rows-subgrid");
    const parents = PRIMITIVES.match(/grid grid-rows-\[auto_auto_auto\]/g) ?? [];
    expect(parents.length).toBe(2); // LevelHero's own grid and HeroStatRow
    // and the number still cannot bleed into the neighbouring column
    expect(PRIMITIVES).toContain("whitespace-nowrap");
  });

  it("does not re-introduce a hydration mismatch on the freshness clock", () => {
    expect(SHELL_R3).toMatch(/suppressHydrationWarning[\s\S]{0,400}pricesSyncedAgo/);
  });
});

/**
 * Round 4 — every level's hero itemises the mechanisms its plan includes, so
 * the value of the upgrade is legible card by card instead of rolled up.
 */
describe("round 4 · per-mechanism hero KPIs", () => {
  const MECH_LABELS = ["Arbitrage saving", "Benchmark saving", "Rightsize saving"];

  it("Certify keeps its two mechanism cards", () => {
    for (const label of MECH_LABELS.slice(0, 2)) {
      expect(LEVEL_FILES.certify, label).toContain(`label="${label}"`);
    }
  });

  it("Rightsize shows all three mechanism cards, consistently styled", () => {
    expect(LEVEL_FILES.rightsize).toContain("<MechanismStats mech={mech} />");
    for (const label of MECH_LABELS) {
      expect(read("components/dashboard/levels/RightsizeLevel.tsx"), label).toContain(
        `label="${label}"`,
      );
    }
  });

  it("Govern inherits the same three cards, not a copy", () => {
    expect(LEVEL_FILES.govern).toContain("<MechanismStats mech={mech} />");
    expect(LEVEL_FILES.govern).toContain(
      'from "@/components/dashboard/levels/RightsizeLevel"',
    );
    // and keeps its own second row
    expect((LEVEL_FILES.govern.match(/<HeroStatRow/g) ?? []).length).toBe(2);
    for (const label of ["Running unattended", "New candidates eligible", "Held for you", "Cooldown"]) {
      expect(LEVEL_FILES.govern, label).toContain(label);
    }
  });

  it("states the dedup reconciliation next to the mechanism cards", () => {
    const src = read("components/dashboard/levels/RightsizeLevel.tsx");
    expect(src).toContain("mechanismSentence");
    expect(src).toContain("counted twice across");
    expect(LEVEL_FILES.rightsize).toContain("mechanismSentence(mech)");
    expect(LEVEL_FILES.govern).toContain("mechanismSentence(mech)");
  });

  it("mechanism figures are window sums, never run-rates", () => {
    const src = read("components/dashboard/levels/RightsizeLevel.tsx");
    expect(src).not.toMatch(/monthlySaving/);
    expect(src).toContain("r.saving");
  });
});
