import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, RotateCw, X } from "lucide-react";

import { AccountShell } from "@/components/dashboard/AccountShell";
import {
  BACKFILL_LOOKBACK_DAYS,
  CONTAINER_DEFAULTS,
  dockerRunSnippet,
  PROVIDER_PRESETS,
  ROLLING_WINDOW_DAYS,
  sdkBaseUrl,
  sdkSnippet,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
  verifySnippet,
} from "@/lib/ingest/contract";


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

function Tokens({ orgId }: { orgId: string; orgName: string }) {
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
    </AccountShell>
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

/**
 * The quickstart a stranger actually follows (Dispatch 124).
 *
 * Everything below renders from CONTAINER_DEFAULTS / PROVIDER_PRESETS — the
 * same constants the container and the package README read — because the
 * snippet and the docs used to disagree on the env var name, the port and the
 * image tag, and the copy a real customer pasted was the wrong one.
 *
 * What the audit found missing for an outsider, and is now here: the SDK base
 * URL differs per provider (an Anthropic client appending /v1/messages to
 * ".../v1" 404s and looks like a broken proxy), a verify step, what happens
 * when a provider's envelope isn't one of the six shapes, and the four real
 * failure modes with the command that distinguishes them.
 */
function Quickstart({ token }: { token: string | null }) {
  const shown = token ?? "cma_live_…";
  const [presetId, setPresetId] = useState(PROVIDER_PRESETS[0].id);
  const [language, setLanguage] = useState<SnippetLanguage>("env");
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[0];

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Quickstart</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The Verification Engine runs <span className="font-semibold text-foreground">in your environment</span>
        , one container per provider.{" "}
        <span className="font-semibold text-foreground">
          Your application keeps sending its own provider key exactly as it does today.
        </span>{" "}
        The Verification Engine copies your <span className="font-mono">Authorization</span> header (and{" "}
        <span className="font-mono">x-api-key</span>, and every other header) to the provider byte
        for byte and never reads, stores or logs it. We hold no provider credential of yours, so
        there is nothing for you to paste here and nothing of yours for us to leak. The only thing
        that changes in your application is one line: the base URL.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {PROVIDER_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              p.id === preset.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Step n={1} title="Run the Verification Engine">
        <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed">
          {dockerRunSnippet(shown, preset.upstream, {
            name: `costmyai-${preset.id}`,
            port: preset.port,
          })}
        </pre>
      </Step>

      <Step n={2} title="Point your client at it">
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          There is no CostMyAI SDK — none exists, and none is coming. Any HTTP client works,
          because all that changes is the base URL your existing client already accepts.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SNIPPET_LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLanguage(l.id)}
              className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                l.id === language
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed">
          {sdkSnippet(preset, language)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing else changes. Your key, your models, your code paths — identical. Provider errors
          come back with the provider's own status, headers and body; a paid completion is never
          retried; streaming responses stream through as they arrive.
        </p>
      </Step>

      <Step n={3} title="Verify it">
        <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed">
          {verifySnippet(preset)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-mono">/healthz</span> reports the upstream it fronts, queue depth,
          last successful flush and last error. After the real call in step 2 of that block, check
          that <span className="font-mono">queued</span> returns to 0 and{" "}
          <span className="font-mono">lastFlushAt</span> is recent. Your first events appear on the
          dashboard within about a minute. Events queue to disk if we're unreachable, so a CostMyAI
          outage never touches your inference path.
        </p>
      </Step>


      {/*
        Dispatch 104 enumerated six shapes across the tracked providers. A
        customer whose provider is not one of them deserves to know what that
        means before they wire it up, not after.
      */}
      <div className="mt-6 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold">If we don't recognise your provider's responses</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          The Verification Engine reads envelopes, not models — six shapes cover the tracked providers
          (OpenAI-compatible, Anthropic, Google, Cohere, Bedrock Converse, Tencent Hunyuan), so every
          model a covered provider ships is covered the day it ships. Anything else is still
          forwarded untouched — your inference never depends on us recognising it — and the event is
          reported honestly as <span className="font-mono">unparsed</span> rather than guessed at:
          you'll see the request, its model, host, latency and status, with no token counts and no
          cost. We keep a content-free structural skeleton of those responses (keys and numbers, every
          string erased before it leaves your network), so when the parser ships your earlier traffic
          is re-read and the history stops under-reporting. Tell us the provider and we'll add the
          shape.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold">If something goes wrong</p>
        <dl className="mt-2 space-y-2 text-xs text-muted-foreground">
          <Trouble symptom="Your calls work, but nothing appears on the dashboard">
            Wrong or revoked ingest token. <span className="font-mono">/healthz</span> shows{" "}
            <span className="font-mono">queued</span> climbing and a 401 in{" "}
            <span className="font-mono">lastError</span>. Rotate above and redeploy — the queued
            metadata drains once the new token is accepted, nothing is lost.
          </Trouble>
          <Trouble symptom="Your calls fail with a 502 from the Verification Engine">
            The container can't reach the provider. Check egress from wherever it runs:{" "}
            <span className="font-mono">docker exec costmyai-{preset.id} wget -qO- {preset.upstream}</span>
            . A 504 instead means the provider didn't send headers within the timeout — never a
            retry, so you're never billed twice.
          </Trouble>
          <Trouble symptom="Your calls return 404 from the provider">
            Wrong base URL for this SDK. It must be exactly{" "}
            <span className="font-mono">{sdkBaseUrl(preset)}</span> for {preset.label} — the suffix
            differs per provider.
          </Trouble>
          <Trouble symptom="Wrong upstream configured">
            One container fronts one provider. Sending Anthropic traffic to a container whose{" "}
            <span className="font-mono">{CONTAINER_DEFAULTS.env.upstream}</span> is OpenAI reaches
            OpenAI and fails there. <span className="font-mono">/healthz</span> names the upstream it
            is actually fronting — check that first.
          </Trouble>
          <Trouble symptom="Container exits immediately on start">
            A required variable is missing; the container says which one and stops rather than
            running half-configured. <span className="font-mono">docker logs costmyai-{preset.id}</span>
            .
          </Trouble>
        </dl>
      </div>

      {/*
        The backfill promise, rendered from the same constants the poll planner
        reads (src/lib/ingest/backfill.ts) and the package README quotes. It used
        to be a sentence typed into the docs only, which is how a promise and the
        code behind it drift apart.
      */}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Billing reconciliation, day one.</span>{" "}
        Optional: mount read-only billing credentials and the first poll after you connect a provider
        looks back <span className="font-mono">{BACKFILL_LOOKBACK_DAYS}</span> days, so you see a real
        reconciled month immediately instead of waiting for one to accumulate. Every poll after that
        re-reads only the last <span className="font-mono">{ROLLING_WINDOW_DAYS}</span> days, because
        invoices settle late but settled invoices don't change. Captures are idempotent, so a
        restart, a reconnect or a re-run cannot double-count a month. If a provider exposes less
        history than that, the shortfall appears as a coverage note rather than a silently short
        window. This reconciles invoice totals only — connecting today does not retroactively create
        yesterday's per-model breakdown.
      </p>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold">
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] tabular-nums text-primary">
          {n}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

function Trouble({ symptom, children }: { symptom: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{symptom}</dt>
      <dd className="mt-0.5 leading-relaxed">{children}</dd>
    </div>
  );
}



function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </main>
  );
}
