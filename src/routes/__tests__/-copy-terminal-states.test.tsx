// @vitest-environment jsdom
/**
 * The authenticated copy buttons cannot be reached in a browser run without a
 * session, so their terminal states are proven here instead. Both paths matter:
 * a successful copy and a copy that fails with no clipboard and a failing
 * execCommand. Silence on the token panels is the worst case, because the token
 * is shown once.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MintedPanel as SettingsMintedPanel } from "@/routes/_authenticated/settings";
import { MintedPanel as AdminMintedPanel } from "@/routes/_authenticated/admin/gateway-keys";
import { ReferralCode } from "@/routes/_authenticated/partner";
import { BrandKitCard } from "@/components/partner/BrandKitCard";

vi.mock("@/lib/partner-badge.functions", () => ({
  getMyPartnerBanner: vi.fn(() => Promise.resolve({ dataUrl: "", filename: "x.png" })),
}));

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });
}

function ok() {
  setClipboard({ writeText: vi.fn(() => Promise.resolve()) });
}

function fail() {
  setClipboard(undefined);
  (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
}

afterEach(() => {
  cleanup();
  setClipboard(undefined);
  vi.restoreAllMocks();
});

async function expectState(label: string, state: "ok" | "fail") {
  await waitFor(() => {
    const btn = screen.getByLabelText(label);
    expect(btn.getAttribute("data-copy-state")).toContain(state);
  });
}

describe("authenticated copy buttons reach a visible terminal state", () => {
  it("settings minted token, success and failure", async () => {
    ok();
    const { unmount } = render(
      <SettingsMintedPanel
        minted={{ token: "cma_live_abc", id: "1", name: "t" } as never}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Copy token"));
    await expectState("Token copied", "ok");
    unmount();

    fail();
    render(
      <SettingsMintedPanel
        minted={{ token: "cma_live_abc", id: "1", name: "t" } as never}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Copy token"));
    await expectState("Copy failed", "fail");
    expect(
      screen.getAllByText("The token is still on screen. Select it and copy it by hand."),
    ).not.toHaveLength(0);
  });

  it("admin gateway key, success and failure", async () => {
    ok();
    const { unmount } = render(
      <AdminMintedPanel token="cgw_abc" name="tenant" onDismiss={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText("Copy key"));
    await expectState("Key copied", "ok");
    unmount();

    fail();
    render(<AdminMintedPanel token="cgw_abc" name="tenant" onDismiss={() => {}} />);
    fireEvent.click(screen.getByLabelText("Copy key"));
    await expectState("Copy failed", "fail");
    expect(
      screen.getAllByText("The key is still on screen. Select it and copy it by hand."),
    ).not.toHaveLength(0);
  });

  it("partner referral link and code, success and failure", async () => {
    ok();
    const { unmount } = render(<ReferralCode code="ROBIN" />);
    fireEvent.click(screen.getByLabelText("Copy link"));
    await expectState("Link copied", "ok");
    fireEvent.click(screen.getByLabelText("Copy code only"));
    await expectState("Code copied", "ok");
    unmount();

    fail();
    render(<ReferralCode code="ROBIN" />);
    fireEvent.click(screen.getByLabelText("Copy link"));
    await waitFor(() => expect(screen.getAllByLabelText("Copy failed").length).toBeGreaterThan(0));
  });

  it("partner brand kit verification link, success and failure", async () => {
    ok();
    const { unmount } = render(<BrandKitCard referralCode="ROBIN" active />);
    fireEvent.click(screen.getByLabelText("Copy verification link"));
    await expectState("Verification link copied", "ok");
    unmount();

    fail();
    render(<BrandKitCard referralCode="ROBIN" active />);
    fireEvent.click(screen.getByLabelText("Copy verification link"));
    await expectState("Copy failed", "fail");
  });
});
