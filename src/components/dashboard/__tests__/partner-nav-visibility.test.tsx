// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";

/**
 * The partner area is a separate identity surface from a workspace, and the
 * dashboard is the customer's buying surface. So the account nav lists no
 * Partner entry at all — for a partner and a non-partner alike, in both
 * scopes. Partners come in at /partner/login instead. The nav no longer asks
 * who is a partner, so there is nothing to vary between the two cases beyond
 * proving the row is gone.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("@/components/dashboard/DashboardChrome", () => ({
  DashboardMasthead: () => <div />,
}));

const { DashboardSidebar } = await import("@/components/dashboard/DashboardSidebar");
const { DashboardSkeleton } = await import("@/components/dashboard/DashboardSkeleton");

beforeEach(() => {
  cleanup();
});

describe("Partner nav entry", () => {
  it.each(["mine", "demo"] as const)("is absent from the sidebar in the %s scope", (scope) => {
    render(
      <DashboardSidebar workspaceName="Acme" plan="compare" level="overview" scope={scope} />,
    );
    expect(screen.queryByText("Partner")).toBeNull();
    expect(screen.queryByRole("link", { name: /^Partner$/ })).toBeNull();
    // The rest of the account nav is untouched.
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Billing")).toBeTruthy();
    expect(screen.getByText("Team")).toBeTruthy();
    expect(screen.getByText("Suggest a feature")).toBeTruthy();
  });

  it.each(["mine", "demo"] as const)(
    "is absent from the loading skeleton in the %s scope",
    (scope) => {
      render(<DashboardSkeleton scope={scope} level="overview" />);
      expect(screen.queryByText("Partner")).toBeNull();
      expect(screen.getByText("Settings")).toBeTruthy();
    },
  );

  it("never links anywhere under /partner from the dashboard sidebar", () => {
    const { container } = render(
      <DashboardSidebar workspaceName="Acme" plan="govern" level="overview" scope="mine" />,
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("to") ?? a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/partner"))).toBe(false);
  });
});
