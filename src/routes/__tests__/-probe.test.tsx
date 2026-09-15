// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import type * as React from "react";
import "@testing-library/jest-dom/vitest";

/**
 * The homepage must render when the live counters cannot be read.
 * A missing number is acceptable; an unanswerable page is not.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // Route definition and links only: the page is rendered directly, outside a router.
    createFileRoute: () => (opts: unknown) => ({ options: opts }),
    Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
    useRouterState: () => ({ location: { pathname: "/" } }),
    useRouter: () => ({ navigate: () => {}, state: { location: { pathname: "/" } } }),
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: "/" }),
    useSearch: () => ({}),
    useParams: () => ({}),
  };
});



// jsdom does not implement matchMedia; the shell reads it on mount.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Reveal/CountUp observe the viewport; jsdom has no IntersectionObserver.
if (!("IntersectionObserver" in globalThis)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});


import { Component as RC } from "react";

class EB extends RC<{ children: React.ReactNode }, { e: unknown }> {
  state = { e: null as unknown };
  static getDerivedStateFromError(e: unknown) { return { e }; }
  render() { return this.state.e ? <div>ERR {String(this.state.e)}</div> : this.props.children; }
}


const STATS = { modelCount: 5, providerCount: 1, priceChangesTracked: 0, trackingSince: null, providers: ["Groq"], live: false };

describe("probe4", () => {
  it("each homepage part", async () => {
    const mods: [string, () => Promise<any>][] = [
      ["Estimator", () => import("@/components/marketing/Estimator")],
      ["ArchitectureDiagram", () => import("@/components/marketing/ArchitectureDiagram")],
      ["ForecastDiagram", () => import("@/components/marketing/ForecastDiagram")],
      ["GradientPanel", () => import("@/components/marketing/GradientPanel")],
      ["PriceDriftRibbon", () => import("@/components/marketing/PriceDriftRibbon")],
      ["ProviderMarquee", () => import("@/components/marketing/ProviderMarquee")],
      ["Reveal", () => import("@/components/marketing/Reveal")],
    ];
    for (const [name, load] of mods) {
      const m = await load();
      const C = m[name];
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { container, unmount } = render(
        <QueryClientProvider client={qc}>
          <Suspense fallback={<div>LOADING</div>}>
            <C stats={STATS}>x</C>
          </Suspense>
        </QueryClientProvider>,
      );
      await new Promise((r) => setTimeout(r, 200));
      console.log("PART", name, container.textContent?.slice(0, 40));
      unmount();
    }
  });
});
