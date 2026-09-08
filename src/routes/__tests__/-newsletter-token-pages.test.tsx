// @vitest-environment jsdom
/**
 * The confirm and unsubscribe links are the only two pages a reader reaches
 * from an email, with no session and no second chance. Both server functions
 * settle rather than throw, so each page must render a definite outcome for
 * the good token and for the spent one.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const confirmFn = vi.fn();
const unsubscribeFn = vi.fn();

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("@/components/marketing/MarketingShell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/newsletter.functions", () => ({
  confirmNewsletterSubscription: (args: { data: { token: string } }) => confirmFn(args),
  unsubscribeFromNewsletter: (args: { data: { token: string } }) => unsubscribeFn(args),
}));

import { ConfirmPage } from "@/routes/newsletter.confirm";
import { UnsubscribePage } from "@/routes/newsletter.unsubscribe";

beforeEach(() => {
  confirmFn.mockReset();
  unsubscribeFn.mockReset();
});
afterEach(() => cleanup());

describe("newsletter confirm page", () => {
  it("renders the success state for a good token", async () => {
    confirmFn.mockResolvedValue({ status: "confirmed", unsubscribeToken: "u" });
    render(<ConfirmPage token="good-token" />);
    await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent(/on the list/i));
    expect(confirmFn).toHaveBeenCalledWith({ data: { token: "good-token" } });
  });

  it("renders the expired state for a spent token", async () => {
    confirmFn.mockResolvedValue({ status: "invalid", unsubscribeToken: null });
    render(<ConfirmPage token="spent" />);
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent(/expired or was already used/i),
    );
  });
});

describe("newsletter unsubscribe page", () => {
  it("renders the success state for a good token", async () => {
    unsubscribeFn.mockResolvedValue({ status: "unsubscribed" });
    render(<UnsubscribePage token="good-token" />);
    await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent(/off the list/i));
    expect(unsubscribeFn).toHaveBeenCalledWith({ data: { token: "good-token" } });
  });

  it("renders the expired state for an unknown token", async () => {
    unsubscribeFn.mockResolvedValue({ status: "invalid" });
    render(<UnsubscribePage token="nope" />);
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent(/expired or was already used/i),
    );
  });
});
