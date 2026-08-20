import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";

import { lovable } from "@/integrations/lovable";
import { recordSignupConsent } from "@/lib/consent.functions";
import { supabase } from "@/integrations/supabase/client";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";

/** Only same-origin app paths may be used as a post-sign-in destination. */
function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/auth")) return null;
  return value;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeNext(search.next);
    return next ? { next } : {};
  },

  head: () => ({
    meta: [
      { title: "Sign in — CostMyAI" },
      {
        name: "description",
        content:
          "Sign in to CostMyAI to connect your gateway, see your real AI spend, and activate certified cost switches.",
      },
      { property: "og:title", content: "Sign in — CostMyAI" },
      {
        property: "og:description",
        content: "Connect your gateway and see what your AI stack really costs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

const AUTH_NEXT_KEY = "costmyai:auth-next";

function AuthPage() {
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

  async function sendReset() {
    setError(null);
    if (!email) {
      setError("Enter your email address first, then tap Forgot password.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }


  useEffect(() => {
    // OAuth can return to this public route after a full-page redirect. Read the
    // persisted session once, then perform a clean navigation so the protected
    // route starts with the completed session rather than racing setSession().
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive || !data.session) return;
      finishSignIn(next);
    });
    return () => {
      alive = false;
    };
  }, [next]);

  function finishSignIn(routeNext: string | undefined) {
    const storedNext = safeNext(window.sessionStorage.getItem(AUTH_NEXT_KEY));
    const destination = routeNext ?? storedNext ?? "/workspace";
    window.sessionStorage.removeItem(AUTH_NEXT_KEY);
    window.location.replace(destination);
  }

  /**
   * Wait for the session to actually be committed to storage before navigating.
   * Without this, the protected route fires its server functions against a
   * half-written session and gets a bare 401 — which used to surface as an
   * endless spinner. On timeout we raise a real, readable error instead.
   */
  async function waitForCommittedSession(timeoutMs = 12_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) return userData.user;
      }
      if (Date.now() > deadline) {
        throw new Error(
          "Signed in with Google, but the session did not finish saving in this browser. Reload this page and try again.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAgreeError(false);
    if (mode === "signup" && !agreed) {
      setAgreeError(true);
      setError("Please agree to the Terms and Privacy Policy before creating an account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`,
          },
        });
        if (error) throw error;
        // The acceptance record is written server-side: with email confirmation
        // on there is no session yet, so the user cannot write it themselves.
        if (data.user) {
          await recordSignupConsent({
            data: { userId: data.user.id, email, method: "password_signup" },
          });
        }
        // With confirmation on, signUp returns no session — the user is not in yet.
        if (!data.session) setCheckEmail(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user) throw new Error("Sign-in did not return a user.");
        await waitForCommittedSession();
        finishSignIn(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setAgreeError(false);
    if (mode === "signup" && !agreed) {
      setAgreeError(true);
      setError("Please agree to the Terms and Privacy Policy before creating an account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Keep the intended route on this origin. OAuth providers and preview
      // brokers may normalize callback query strings, but sessionStorage
      // survives the round-trip and cannot redirect to another origin.
      if (next) window.sessionStorage.setItem(AUTH_NEXT_KEY, next);
      else window.sessionStorage.removeItem(AUTH_NEXT_KEY);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
        extraParams: {
          login_hint: "mail@costmyai.com",
          prompt: "select_account",
        },
      });
      if (result.error) throw result.error;
      if (result.redirected) return;

      const user = await waitForCommittedSession();
      if (user.email) {
        await recordSignupConsent({
          data: { userId: user.id, email: user.email, method: "google_signup" },
        }).catch(() => undefined);
      }
      finishSignIn(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <a href="/" className="mb-10 block text-center text-lg font-semibold tracking-tight">
          Cost<span className="text-primary">My</span>AI
        </a>

        {resetSent ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Mail className="mx-auto h-6 w-6 text-primary" />
            <h1 className="mt-4 text-base font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for {email}, we sent a link to set a new password. It expires
              after one hour.
            </p>
            <button
              type="button"
              onClick={() => setResetSent(false)}
              className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        ) : checkEmail ? (

          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Mail className="mx-auto h-6 w-6 text-primary" />
            <h1 className="mt-4 text-base font-semibold">Confirm your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to {email}. Open it and you'll land straight in your
              workspace.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8">
            <h1 className="text-lg font-semibold tracking-tight">
              {mode === "signin" ? "Sign in" : "Create your workspace"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Pick up where your spend left off."
                : "Free on Compare. No card, no provider keys."}
            </p>

            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              {mode === "signup" ? (
                <label
                  htmlFor="agree"
                  className="flex items-start gap-2.5 pt-1 text-left text-sm text-muted-foreground"
                >
                  <input
                    id="agree"
                    name="agree"
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => {
                      setAgreed(e.target.checked);
                      if (e.target.checked) {
                        setAgreeError(false);
                        setError(null);
                      }
                    }}
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border bg-background accent-primary ${
                      agreeError ? "border-destructive" : "border-border"
                    }`}
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Terms
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Privacy Policy
                    </a>
                    , including that my usage data is used to compute recommendations for all
                    service tiers, including ones I have not subscribed to.
                  </span>
                </label>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Create account"}
                {!busy ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </form>

            {mode === "signin" ? (
              <button
                type="button"
                onClick={sendReset}
                disabled={busy}
                className="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
              >
                Forgot password?
              </button>
            ) : null}


            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "signin"
                ? "No account yet? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          CostMyAI never asks for your provider API keys.{" "}
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Book a Demo
          </a>
        </p>
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
