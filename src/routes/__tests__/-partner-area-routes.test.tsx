// @vitest-environment jsdom
/**
 * The partner area is three routes behind one layout. The layout owns the
 * "not a partner" answer, so someone who is not a partner has to get that same
 * honest state on /partner/earnings and /partner/settings, not a crash or an
 * empty shell. A partner gets the sidebar with the entry for the page they are
 * on marked current.
 */
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/partner";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname } }),
  createFileRoute: () => (opts: unknown) => opts,
}));

const getMyPartner = vi.fn();
vi.mock("@/lib/partners.functions", () => ({ getMyPartner: () => getMyPartner() }));
vi.mock("@/lib/partner-application.functions", () => ({
  claimPartnerMembership: () => Promise.resolve({ partnerId: null }),
}));
const listMyWorkspaces = vi.fn();
vi.mock("@/lib/workspace.functions", () => ({
  listMyWorkspaces: () => listMyWorkspaces(),
}));
const getDemoAccess = vi.fn();
vi.mock("@/lib/demo-access.functions", () => ({
  getDemoAccess: () => getDemoAccess(),
}));

const ACTIVE_PARTNER = {
  partner: { name: "Quinn Consulting", status: "active", referralCode: "QUINN" },
  referrals: [],
  commissions: [],
  payouts: [],
  totals: { earnedUsd: 0, outstandingUsd: 0 },
};

const { PartnerLayout } = await import("@/routes/_authenticated/partner");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PartnerLayout />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  pathname = "/partner";
  listMyWorkspaces.mockResolvedValue([{ id: "w1", name: "Acme", slug: "acme", plan: "compare", role: "owner" }]);
  getDemoAccess.mockResolvedValue({ audience: "partner" });
});

describe("demo system link", () => {
  it("renders for an active partner the server grants demo access", async () => {
    getMyPartner.mockResolvedValue(ACTIVE_PARTNER);
    mount();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Demo System/i })).toHaveAttribute("href", "/demo"),
    );
  });

  it("is absent when the demo-access answer is null", async () => {
    getMyPartner.mockResolvedValue(ACTIVE_PARTNER);
    getDemoAccess.mockResolvedValue({ audience: null });
    mount();
    await waitFor(() => expect(screen.getByTestId("outlet")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Demo System/i })).toBeNull();
  });

  it("is absent while the demo-access read is still pending", async () => {
    getMyPartner.mockResolvedValue(ACTIVE_PARTNER);
    getDemoAccess.mockReturnValue(new Promise(() => {}));
    mount();
    await waitFor(() => expect(screen.getByTestId("outlet")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Demo System/i })).toBeNull();
  });
});

describe("partner area routes", () => {
  it.each(["/partner", "/partner/earnings", "/partner/settings"])(
    "shows the not-a-partner state on %s",
    async (path) => {
      pathname = path;
      getMyPartner.mockResolvedValue(null);
      mount();
      await waitFor(() =>
        expect(screen.getByText(/aren't part of a partner account yet/i)).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
    },
  );

  it("renders the partner sidebar and the child page for a partner", async () => {
    pathname = "/partner/earnings";
    getMyPartner.mockResolvedValue(ACTIVE_PARTNER);
    mount();
    await waitFor(() => expect(screen.getByTestId("outlet")).toBeInTheDocument());
    expect(screen.getByText("Quinn Consulting")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Earnings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    const back = screen.getByRole("link", { name: /Back to your workspace/i });
    expect(back).toBeInTheDocument();
    expect(back).toHaveAttribute("href", "/workspace");
  });

  it.each(["/partner", "/partner/earnings", "/partner/settings"])(
    "never offers the workspace link to a partner with no workspace, on %s",
    async (path) => {
      pathname = path;
      getMyPartner.mockResolvedValue(ACTIVE_PARTNER);
      listMyWorkspaces.mockResolvedValue([]);
      mount();
      await waitFor(() => expect(screen.getByTestId("outlet")).toBeInTheDocument());
      expect(screen.queryByRole("link", { name: /Back to your workspace/i })).toBeNull();
    },
  );

  it("leaves the workspace link out while the workspace read is still pending", async () => {
    getMyPartner.mockResolvedValue(ACTIVE_PARTNER);
    listMyWorkspaces.mockReturnValue(new Promise(() => {}));
    mount();
    await waitFor(() => expect(screen.getByTestId("outlet")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Back to your workspace/i })).toBeNull();
  });

  it("does not push a non-partner without a workspace into workspace creation", async () => {
    getMyPartner.mockResolvedValue(null);
    listMyWorkspaces.mockResolvedValue([]);
    mount();
    await waitFor(() =>
      expect(screen.getByText(/aren't part of a partner account yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /Back to your workspace/i })).toBeNull();
  });
});
