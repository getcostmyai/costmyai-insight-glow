// @vitest-environment jsdom
/**
 * The failsafe must rescue visible prose without destroying the scroll reveal.
 *
 * Two cases matter. A block the observer never reports on, but which is sitting
 * on screen (the tall-section case: a block taller than the viewport can never
 * reach a 0.25 ratio inside a root shrunk by 10%), must reveal after the timer.
 * A block that is genuinely below the fold must stay hidden until a scroll
 * actually brings it into the viewport.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Reveal } from "@/components/marketing/Reveal";

/** Drives getBoundingClientRect for every element in the test. */
let rect = { top: 0, bottom: 100 };

function setRect(top: number, bottom: number) {
  rect = { top, bottom };
}

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
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Element.prototype.getBoundingClientRect = function () {
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: 0,
      right: 0,
      width: 0,
      height: rect.bottom - rect.top,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const hidden = (el: HTMLElement) => el.className.includes("motion-safe:opacity-0");

describe("Reveal rect fallback", () => {
  it("reveals an on-screen block the observer never reports on", () => {
    vi.useFakeTimers();
    // Taller than the viewport, so it can never satisfy the 0.25 threshold.
    setRect(-200, 1400);
    render(<Reveal>tall prose</Reveal>);
    const el = screen.getByText("tall prose");
    expect(hidden(el)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(hidden(el)).toBe(false);
    expect(el.className).toContain("opacity-100");
  });

  it("keeps an off-screen block hidden until a scroll brings it on screen", () => {
    vi.useFakeTimers();
    setRect(2000, 2600);
    render(<Reveal>below the fold</Reveal>);
    const el = screen.getByText("below the fold");

    act(() => {
      vi.advanceTimersByTime(1300);
    });
    // The timer fired and found nothing on screen, so the reveal still waits.
    expect(hidden(el)).toBe(true);

    // A scroll that does not bring it into view changes nothing.
    setRect(1200, 1800);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(hidden(el)).toBe(true);

    // Now it is genuinely on screen.
    setRect(400, 1000);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(hidden(el)).toBe(false);
  });
});
