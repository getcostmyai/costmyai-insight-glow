import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth_/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — CostMyAI" },
      {
        name: "description",
        content: "Choose a new password for your CostMyAI account and get back to your workspace.",
      },
      { property: "og:title", content: "Set a new password — CostMyAI" },
      {
        property: "og:description",
        content: "Choose a new password for your CostMyAI account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type State = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const [state, setState] = useState<State>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    // The recovery link hands the session to the Supabase client either through
    // the URL hash (implicit) or a ?code= exchange (PKCE). Both land as a real
    // session; wait briefly for whichever path this link used.
    async function resolveSession() {
      const deadline = Date.now() + 8_000;
      for (;;) {
        const { data } = await supabase.auth.getSession();
        if (data.session) return data.session;
        if (Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    void (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        // PKCE recovery links carry a code that must be exchanged once.
        await supabase.auth.exchangeCodeForSession(code).catch(() => undefined);
      }
      const errorDescription =
        url.searchParams.get("error_description") ??
        new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");

      const session = await resolveSession();
      if (!alive) return;
      if (!session) {
        setError(
          errorDescription ??
            "This reset link is no longer valid. Request a new one from the sign-in page.",
        );
        setState("invalid");
        return;
      }
      setEmail(session.user.email ?? null);
      setState("ready");
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
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

        <div className="rounded-2xl border border-border bg-card p-8">
          {state === "checking" ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your reset link…
            </p>
          ) : null}

          {state === "invalid" ? (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Link expired</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <a
                href="/auth"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Back to sign in <ArrowRight className="h-4 w-4" />
              </a>
            </>
          ) : null}

          {state === "ready" ? (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {email ? `For ${email}.` : "Choose a new password."} At least 8 characters.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-3">
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Update password
                </button>
              </form>
            </>
          ) : null}

          {state === "done" ? (
            <div className="text-center">
              <ShieldCheck className="mx-auto h-6 w-6 text-primary" />
              <h1 className="mt-4 text-base font-semibold">Password updated</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You're signed in with your new password.
              </p>
              <a
                href="/workspace"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Go to workspace <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
