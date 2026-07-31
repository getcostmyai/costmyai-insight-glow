import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type SessionState = {
  /** null while unknown (SSR + first paint), then the email or null when signed out. */
  email: string | null;
  signedIn: boolean;
  /** false until the first real session read resolves — avoids flashing "Sign in". */
  ready: boolean;
};

/**
 * Session-aware header state.
 *
 * The affordance MUST come from the live session, not from a static route prop:
 * after an OAuth round-trip the session lands via `onAuthStateChange`, and any
 * component that decided "signed out" at render time would stay wrong until a
 * manual refresh. Subscribing first, then reading, closes the race in both
 * directions (session already present, or arriving a tick later).
 */
export function useSessionUser(): SessionState {
  const [state, setState] = useState<SessionState>({
    email: null,
    signedIn: false,
    ready: false,
  });

  useEffect(() => {
    let alive = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setState({
        email: session?.user?.email ?? null,
        signedIn: Boolean(session),
        ready: true,
      });
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setState({
        email: data.session?.user?.email ?? null,
        signedIn: Boolean(data.session),
        ready: true,
      });
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
