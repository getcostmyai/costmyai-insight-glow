// @vitest-environment jsdom
/**
 * The footer form mounts on every page, so "shown" must mean seen, not
 * mounted. These tests drive the IntersectionObserver directly and pin both
 * halves of that: nothing fires before intersection, and exactly one event
 * fires afterwards no matter how many times the observer or the component
 * fires again.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackFn = vi.fn((_args: { data: { source: string } }) => Promise.resolve({ ok: true }));
const subscribeFn = vi.fn((_args: { data: { email: string; source: string } }) =>
  Promise.resolve({ ok: true }),
);

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/newsletter.functions", () => ({
  trackNewsletterShown: (args: { data: { source: string } }) => trackFn(args),
  subscribeToNewsletter: (args: { data: { email: string; source: string } }) => subscribeFn(args),
}));

import { NewsletterSignupForm } from "@/components/marketing/NewsletterSignupForm";
import { resetFireOnce } from "@/lib/telemetry/fire-once";

/** Captured observer callbacks, so a test decides when the form "appears". */
let observers: Array<{ cb: IntersectionObserverCallback; disconnected: boolean }> = [];

class FakeIO {
  cb: IntersectionObserverCallback;
  entry: { disconnected: boolean };
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    this.entry = { disconnected: false };
    observers.push({ cb, disconnected: false });
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.forEach((o) => {
      if (o.cb === this.cb) o.disconnected = true;
    });
  }
  takeRecords() {
    return [];
  }
}

function intersect(isIntersecting = true) {
  for (const o of [...observers]) {
    if (o.disconnected) continue;
    o.cb([{ isIntersecting } as IntersectionObserverEntry], null as never);
  }
}

beforeEach(() => {
  observers = [];
  trackFn.mockClear();
  subscribeFn.mockClear();
  resetFireOnce();
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
});

afterEach(() => cleanup());

describe("newsletter shown telemetry", () => {
  it("does not fire on mount alone", () => {
    render(<NewsletterSignupForm source="footer" />);
    expect(trackFn).not.toHaveBeenCalled();
  });

  it("fires once, with its own source, when the form scrolls into view", async () => {
    render(<NewsletterSignupForm source="footer" />);
    intersect();
    await waitFor(() => expect(trackFn).toHaveBeenCalledTimes(1));
    expect(trackFn).toHaveBeenCalledWith({ data: { source: "footer" } });
  });

  it("ignores a non-intersecting entry", () => {
    render(<NewsletterSignupForm source="footer" />);
    intersect(false);
    expect(trackFn).not.toHaveBeenCalled();
  });

  it("does not fire twice when the same placement remounts in one visit", async () => {
    const first = render(<NewsletterSignupForm source="footer" />);
    intersect();
    await waitFor(() => expect(trackFn).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<NewsletterSignupForm source="footer" />);
    intersect();
    await waitFor(() => expect(trackFn).toHaveBeenCalledTimes(1));
  });

  it("counts two different placements separately", async () => {
    render(<NewsletterSignupForm source="footer" />);
    render(<NewsletterSignupForm source="article-end" />);
    intersect();
    await waitFor(() => expect(trackFn).toHaveBeenCalledTimes(2));
    expect(trackFn.mock.calls.map((c) => c[0].data.source)).toEqual(
      expect.arrayContaining(["footer", "article-end"]),
    );
  });

  it("shows the same fixed success message regardless of outcome", async () => {
    render(<NewsletterSignupForm source="footer" />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "rob@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/check your inbox/i));
    expect(document.body.textContent).not.toMatch(/already subscribed/i);
  });
});
