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

// The server call itself failing outright: the shape a Data API outage takes.
vi.mock("@/lib/marketing.functions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketing.functions")>(
    "@/lib/marketing.functions",
  );
  return {
    ...actual,
    getMarketingStats: vi.fn().mockRejectedValue(new Error("Data API unreachable")),
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

async function renderHomeWithFailedStats() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // The route's own component, imported by name: the build splits route files,
  // so Route.options.component is a lazy shell that cannot resolve under vitest.
  const { HomePage } = await import("../index");
  const { ensureMarketingStats } = await import("@/lib/marketing.functions");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });

  // The loader must resolve rather than reject, even though the read failed.
  const stats = await ensureMarketingStats(queryClient);
  expect(stats.degraded).toBe(true);

  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>loading</div>}>
        <HomePage />
      </Suspense>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("homepage under a failed stats read", () => {
  it("still renders its content", async () => {
    await renderHomeWithFailedStats();
    // Real page content, not a fallback or a blank document.
    expect(await screen.findAllByRole("link", {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(document.body.textContent).not.toBe("loading");
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(200);
  });

  it("does not leave the loader pending or rejected", async () => {
    const queryClient = await renderHomeWithFailedStats();
    const cached = queryClient.getQueryData(["marketing-stats"]) as { degraded?: boolean };
    expect(cached?.degraded).toBe(true);
  });
});
