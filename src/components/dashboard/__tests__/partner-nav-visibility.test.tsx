// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * The Partner entry is for partners. Everyone else used to be sent to a page
 * that told them they are not one, so both the live nav and the loading
 * skeleton must leave the row out until the answer is known and positive.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("@/components/dashboard/DashboardChrome", () => ({
  DashboardMasthead: () => <div />,
}));

const isPartner = vi.fn<() => boolean | undefined>();
vi.mock("@/hooks/use-is-partner", () => ({ useIsPartner: () => isPartner() }));

const { DashboardSidebar } = await import("@/components/dashboard/DashboardSidebar");
const { DashboardSkeleton } = await import("@/components/dashboard/DashboardSkeleton");

beforeEach(() => {
  cleanup();
  isPartner.mockReset();
});

describe("Partner nav entry", () => {
  it("is hidden in the sidebar for a non-partner", () => {
    isPartner.mockReturnValue(false);
    render(
      <DashboardSidebar workspaceName="Acme" plan="compare" level="overview" scope="mine" />,
    );
    expect(screen.queryByText("Partner")).toBeNull();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("is hidden while the answer is still unknown, so it never flickers", () => {
    isPartner.mockReturnValue(undefined);
    render(
      <DashboardSidebar workspaceName="Acme" plan="compare" level="overview" scope="mine" />,
    );
    expect(screen.queryByText("Partner")).toBeNull();
  });

  it("is shown in the sidebar for a partner", () => {
    isPartner.mockReturnValue(true);
    render(
      <DashboardSidebar workspaceName="Acme" plan="compare" level="overview" scope="mine" />,
    );
    expect(screen.getByText("Partner")).toBeTruthy();
  });

  it("is hidden in the loading skeleton for a non-partner and shown for a partner", () => {
    isPartner.mockReturnValue(false);
    const { unmount } = render(<DashboardSkeleton scope="mine" level="overview" />);
    expect(screen.queryByText("Partner")).toBeNull();
    unmount();
    cleanup();

    isPartner.mockReturnValue(true);
    render(<DashboardSkeleton scope="mine" level="overview" />);
    expect(screen.getByText("Partner")).toBeTruthy();
  });
});
