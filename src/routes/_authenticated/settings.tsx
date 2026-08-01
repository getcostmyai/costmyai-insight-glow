import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Plus, RotateCw, X } from "lucide-react";

import {
  createIngestToken,
  listIngestTokens,
  revokeIngestToken,
  rotateIngestToken,
  type MintedTokenRow,
} from "@/lib/keys.functions";
import { ReferralCard } from "@/components/partner/ReferralCard";
import { listMyWorkspaces } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Connection settings — CostMyAI" },
      {
        name: "description",
        content:
          "Generate, rotate and revoke the ingest token your Verification Engine uses to send usage metadata to CostMyAI.",
      },
      { property: "og:title", content: "Connection settings — CostMyAI" },
      {
        property: "og:description",
        content: "Your workspace ingest token — shown once, stored only as a hash.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const org = workspaces.data?.[0];

  if (workspaces.isPending) return <Shell>Loading your workspace…</Shell>;
  if (!org) return <Shell>Create a workspace first.</Shell>;
  if (org.role === "member")
    return <Shell>Only workspace owners and admins can manage connection tokens.</Shell>;

  return <Tokens orgId={org.id} orgName={org.name} />;
}

function Tokens({ orgId, orgName }: { orgId: string; orgName: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [minted, setMinted] = useState<MintedTokenRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokens = useQuery({
    queryKey: ["ingest-tokens", orgId],
    queryFn: () => listIngestTokens({ data: { orgId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ingest-tokens", orgId] });
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : "That did not work. Try again.");

  const create = useMutation({
    mutationFn: () => createIngestToken({ data: { orgId, name } }),
    onSuccess: async (t) => {
      setError(null);
      setName("");
      setMinted(t);
      await refresh();
    },
    onError: fail,
  });

  const rotate = useMutation({
    mutationFn: (keyId: string) => rotateIngestToken({ data: { orgId, keyId } }),
    onSuccess: async (t) => {
      setError(null);
      setMinted(t);
      await refresh();
    },
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => revokeIngestToken({ data: { orgId, keyId } }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const live = (tokens.data ?? []).filter((t) => !t.revokedAt);

  return (
    <AccountShell
      active="settings"
      title="Connect your stack"
      intro="Your Verification Engine authenticates with a workspace ingest token. It sends usage metadata only — never prompts, completions, or your provider keys."
    >
      <div className="w-full max-w-3xl">

        {minted ? <MintedPanel minted={minted} onDismiss={() => setMinted(null)} /> : null}

        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Ingest tokens</h2>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Production gateway"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Generate token
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-6 space-y-2">
            {tokens.isPending ? (
              <p className="text-sm text-muted-foreground">Loading tokens…</p>
            ) : (tokens.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tokens yet. Generate one, paste it into your Verification Engine, and your first
                events land within a minute.
              </p>
            ) : (
              (tokens.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t.name}
                      {t.revokedAt ? (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          revoked
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {t.keyPrefix}…{" · "}
                      {t.lastUsedAt
                        ? `last used ${new Date(t.lastUsedAt).toLocaleString()}`
                        : "never used"}
                    </p>
                  </div>
                  {!t.revokedAt ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => rotate.mutate(t.id)}
                        disabled={rotate.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        Rotate
                      </button>
                      <button
                        onClick={() => revoke.mutate(t.id)}
                        disabled={revoke.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            Tokens are stored as a SHA-256 hash — we cannot show one again. Rotating mints the new
            token before revoking the old one, so you can redeploy without dropping traffic.
            {live.length > 1 ? " More than one token is live right now." : ""}
          </p>
        </section>

        <Quickstart token={minted?.token ?? null} />
        <ReferralCard orgId={orgId} />
      </div>
    </main>
  );
}

/** The one moment the raw token exists in the browser. */
function MintedPanel({ minted, onDismiss }: { minted: MintedTokenRow; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-6">
      <p className="text-sm font-semibold">Copy your token now</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is the only time it is shown. Store it in your secret manager — if you lose it, rotate.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
          {minted.token}
        </code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(minted.token);
            setCopied(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        onClick={onDismiss}
        className="mt-4 text-xs text-muted-foreground underline hover:text-foreground"
      >
        I've stored it
      </button>
    </div>
  );
}

function Quickstart({ token }: { token: string | null }) {
  const shown = token ?? "cma_live_…";
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Quickstart</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Point the Verification Engine at your workspace and restart it.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed">
        {`docker run -d \\
  -e COSTMYAI_INGEST_TOKEN=${shown} \\
  -e COSTMYAI_ENDPOINT=https://costmyai.com \\
  -p 8080:8080 costmyai/gateway:latest`}
      </pre>
      <p className="mt-3 text-xs text-muted-foreground">
        Then send your provider traffic through <span className="font-mono">localhost:8080</span>.
        Events queue locally if we're unreachable, so a CostMyAI outage never touches your
        inference.
      </p>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </main>
  );
}
