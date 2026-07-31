import { createClient } from "@supabase/supabase-js";

/**
 * Google sign-in through Lovable's OAuth broker.
 *
 * The broker exists so the flow also works inside the editor preview iframe,
 * where a provider consent page cannot be framed. It returns the session to
 * this origin, and we hand it to the Supabase client so the rest of the app
 * sees a normal signed-in user.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export const lovable = {
  auth: {
    async signInWithOAuth(
      provider: "google",
      options: { redirect_uri: string },
    ): Promise<void> {
      const { supabase } = await import("./supabase/client");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: options.redirect_uri },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Google sign-in did not start.");
    },
  },
};

/** Kept so tree-shaking never drops the URL check in a misconfigured build. */
export function assertSupabaseConfigured(): void {
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL is not set");
  void createClient;
}
