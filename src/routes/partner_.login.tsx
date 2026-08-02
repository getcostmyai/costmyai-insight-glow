import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Handshake, Loader2, Mail } from "lucide-react";

import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

/**
 * Partner portal entry.
 *
 * Same identity system as everywhere else — there are no separate partner
 * credentials to maintain. What differs is the destination: a session created
 * here lands on `/partner`, never the customer workspace, even when the same
 * account owns one. If the account is not linked through `partner_users`, the
 * dashboard's own honest "not a partner yet" state handles it; nothing here
 * bounces or errors.
 */
export const Route = createFileRoute("/partner/login")({
  head: () => ({
    meta: [
      { title: "Partner sign in — CostMyAI" },
      {
        name: "description",
        content:
          "Sign in to the CostMyAI partner portal to see your referral code, referred workspaces, commission tier and every dollar earned on paid invoices.",
      },
      { property: "og:title", content: "Partner sign in — CostMyAI" },
      {
        property: "og:description",
        content: "The partner portal: referrals, tier progress and commission on real paid invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PartnerLogin,
});

function PartnerLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    // Subscribe first, then read: an OAuth round-trip delivers the session a
    // tick after mount, and a plain read alone would miss it.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/partner", replace: true });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/partner", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/partner/login` },
        });
        if (error) throw error;
        if (!data.session) setCheckEmail(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    try {
      await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/partner/login`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B0B12] px-6 py-16 text-white">
      {/* Portal chrome: one purple wash, no cards stacked on cards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[540px] max-w-3xl rounded-full bg-primary/25 blur-[140px]"
      />

      <div className="relative mx-auto grid w-full max-w-5xl gap-14 lg:grid-cols-[1.05fr_minmax(0,380px)] lg:items-center">
        <div>
          <a href="/" className="text-lg font-semibold tracking-tight">
            Cost<span className="text-primary">My</span>AI
          </a>

          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            <Handshake className="h-3.5 w-3.5 text-primary" />
            Partner portal
          </div>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Your referrals,
            <br />
            measured in paid invoices.
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
            Sign in to see your referral code, the workspaces attributed to you for their lifetime,
            your commission tier and every dollar earned. Commission is written only when a referred
            workspace actually pays, never estimated.
          </p>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              ["15–35%", "of what they pay"],
              ["Lifetime", "attribution, frozen once"],
              ["Paid invoices", "the only trigger"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-lg font-semibold tabular-nums text-white">{value}</dt>
                <dd className="mt-1 text-[11px] leading-snug text-white/45">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur">
          {checkEmail ? (
            <div className="text-center">
              <Mail className="mx-auto h-6 w-6 text-primary" />
              <h2 className="mt-4 text-base font-semibold">Confirm your email</h2>
              <p className="mt-2 text-sm text-white/60">
                We sent a link to {email}. Open it and you'll land straight in the partner portal.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold tracking-tight">
                {mode === "signin" ? "Partner sign in" : "Create your login"}
              </h2>
              <p className="mt-1 text-sm text-white/55">
                {mode === "signin"
                  ? "Same account as your workspace. This door opens the partner side."
                  : "Already approved as a partner? Create the login for your invite email."}
              </p>

              <button
                type="button"
                onClick={google}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.12]"
              >
                <GoogleMark />
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/35">
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={submit} className="space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@agency.com"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary"
                />
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {mode === "signin" ? "Enter partner portal" : "Create login"}
                  {!busy ? <ArrowRight className="h-4 w-4" /> : null}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="mt-5 w-full text-center text-sm text-white/50 hover:text-white"
              >
                {mode === "signin" ? "No login yet? Create one" : "Already have a login? Sign in"}
              </button>

              <p className="mt-6 border-t border-white/10 pt-5 text-xs text-white/40">
                Not a partner yet?{" "}
                <Link to="/partners/apply" className="text-white/70 underline underline-offset-2">
                  Apply to the program
                </Link>
                . Looking for your own spend?{" "}
                <Link to="/auth" className="text-white/70 underline underline-offset-2">
                  Customer sign in
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
