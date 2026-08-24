import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { trackPageView } from "../lib/analytics";
import { CookieConsent } from "@/components/CookieConsent";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { trackPageViewed } from "@/lib/page-telemetry.functions";
import { shouldFirePersisted } from "@/lib/telemetry/fire-once";




function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  origin?: string;
}>()({
  // Resolved once, from the real request, before anything renders. Every
  // absolute URL in the app (share links, OG image links) reads this rather
  // than window.location.origin, which is unknown until hydration. On the
  // client the browser already knows the origin, so no server call is made.
  beforeLoad: async (): Promise<{ origin: string }> => {
    if (typeof window !== "undefined") return { origin: window.location.origin };
    // Same server pass also captures the acquisition source (referrer origin +
    // UTM), first-touch only. This is the only request whose Referer is the
    // external site that actually sent the visitor.
    const [{ getRequestOrigin }, { captureFirstTouch }] = await Promise.all([
      import("@/lib/origin.functions"),
      import("@/lib/source.functions"),
    ]);
    const [origin] = await Promise.all([getRequestOrigin(), captureFirstTouch()]);
    return { origin };
  },


  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "google-site-verification",
        content: "SsPW1eath9RWirTEzXICp-jdtdQs7fLYiMLkIAvn6mU",
      },
      { title: "CostMyAI — stop overpaying for AI" },
      {
        name: "description",
        content: "You're likely overspending on AI. We prove it. You save. You grow.",
      },
      { name: "author", content: "CostMyAI" },
      { property: "og:title", content: "CostMyAI — stop overpaying for AI" },
      {
        property: "og:description",
        content: "You're likely overspending on AI. We prove it. You save. You grow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // One subscriber for the whole app. Filtered to real identity changes:
    // token refreshes fire roughly hourly and on every tab focus, and
    // invalidating on those would thrash the router and the query cache.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // A recovery link produces a real session, so without this the user would
      // silently land wherever the link pointed instead of the "set a new
      // password" form. Send them there, then stop — no cache work is useful
      // until the password is actually changed.
      if (event === "PASSWORD_RECOVERY") {
        if (window.location.pathname !== "/auth/reset-password") {
          void router.navigate({ to: "/auth/reset-password", replace: true });
        }
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      // On sign-out the cache teardown belongs to the sign-out handler —
      // refetching here would only fire protected queries at a dead session.
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });

    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // SPA page views. trackPageView is inert until consent has loaded gtag.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const routeId = useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.routeId ?? "",
  });
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  // First-party page views, every route, one generic mechanism. Not gated on
  // consent: it carries nothing beyond the page plus the visitor/session ids
  // already written unprompted by every other lead event.
  const trackPage = useServerFn(trackPageViewed);
  useEffect(() => {
    if (!shouldFirePersisted(`page_viewed:${pathname}`)) return;
    void trackPage({ data: { path: pathname, routeId } }).catch(() => {});
  }, [pathname, routeId, trackPage]);


  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <CookieConsent />
    </QueryClientProvider>
  );
}


