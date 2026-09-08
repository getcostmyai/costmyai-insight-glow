// @vitest-environment jsdom
/**
 * Published prose must never stay invisible because an observer entry never
 * arrived. This stubs IntersectionObserver so it never reports, and asserts the
 * element still reaches its visible state once the failsafe timer elapses.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Reveal } from "@/components/marketing/Reveal";

beforeAll(() => {
  class SilentIO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = SilentIO;
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Reveal failsafe", () => {
  it("reveals content when the observer never fires", () => {
    vi.useFakeTimers();
    render(<Reveal>visible prose</Reveal>);
    const el = screen.getByText("visible prose");
    expect(el.className).toContain("motion-safe:opacity-0");

    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(el.className).toContain("opacity-100");
    expect(el.className).not.toContain("motion-safe:opacity-0");
  });
});
