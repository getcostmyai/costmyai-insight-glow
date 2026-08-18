import { Link } from "@tanstack/react-router";

import { useSessionUser } from "@/hooks/use-session-user";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardScope } from "@/lib/dashboard-queries";
import { APP_NAV } from "@/lib/nav";

/**
 * The masthead every signed-in dashboard surface shares.
 *
 * Extracted from DashboardShell so the loading and error states can render the
 * same chrome: a customer waiting on a slow snapshot, or looking at a failed
 * one, should still see where they are and be able to leave.
 */
export function DashboardMasthead({ scope }: { scope: DashboardScope }) {
  const session = useSessionUser();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-8 px-5 lg:px-8">
        <Link to="/" className="text-xl font-bold tracking-tight">
          Cost<span className="text-primary">My</span>AI
        </Link>
        <nav className="hidden items-center gap-7 lg:flex">
          {APP_NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {/* Session-driven, never route-driven: after an OAuth callback the
              session arrives asynchronously and this must follow it. */}
          {session.ready && session.signedIn ? (
            <>
              <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:block">
                {session.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                Sign out
              </button>
            </>
          ) : session.ready ? (
            <a
              href="/auth"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Sign in
            </a>
          ) : null}
          <a
            href={session.ready && session.signedIn ? "/workspace" : "/auth"}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.02] active:scale-95"
          >
            {session.ready && session.signedIn
              ? scope === "demo"
                ? "Go to my workspace"
                : "Connect a gateway"
              : "See if you're overpaying"}
          </a>
        </div>
      </div>
    </header>
  );
}
