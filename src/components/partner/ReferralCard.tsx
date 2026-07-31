import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Handshake, Loader2 } from "lucide-react";

import { attachReferral, getWorkspaceReferral } from "@/lib/partners.functions";

/**
 * Referral attribution, claimed once by the workspace owner.
 *
 * Deliberately quiet: it is not a discount, it does not change what the
 * workspace pays, and once attached it cannot be changed — so the copy says
 * exactly that before the click rather than after it.
 */
export function ReferralCard({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const referral = useQuery({
    queryKey: ["workspace-referral", orgId],
    queryFn: () => getWorkspaceReferral({ data: { orgId } }),
  });

  const attach = useMutation({
    mutationFn: () => attachReferral({ data: { orgId, code } }),
    onSuccess: async () => {
      setError(null);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-referral", orgId] });
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "That referral code could not be attached."),
  });

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Handshake className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Referral code</h2>
      </div>

      {referral.data?.attached ? (
        <p className="mt-3 text-sm text-muted-foreground">
          A referral is attached to this workspace
          {referral.data.referredAt
            ? ` since ${new Date(referral.data.referredAt).toLocaleDateString()}`
            : ""}
          . It stays with the workspace and cannot be changed.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Were you referred by a CostMyAI partner? Enter their code. It can be set once, changes
            nothing about what you pay, and cannot be moved afterwards.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
              placeholder="partner-code"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => attach.mutate()}
              disabled={attach.isPending || code.trim().length < 3}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
            >
              {attach.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Attach
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </>
      )}
    </section>
  );
}
