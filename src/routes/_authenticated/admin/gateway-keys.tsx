import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";

import { mintGatewayKey } from "@/lib/keys.functions";

export const Route = createFileRoute("/_authenticated/admin/gateway-keys")({
  head: () => ({
    meta: [
      { title: "Gateway keys — CostMyAI internal" },
      { name: "description", content: "Mint gateway ingest keys for tenant organizations." },
      { property: "og:title", content: "Gateway keys" },
      { property: "og:description", content: "Internal gateway key minting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GatewayKeysPage,
});

function GatewayKeysPage() {
  const mint = useServerFn(mintGatewayKey);
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ token: string; name: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMinted(null);
    try {
      const result = await mint({ data: { orgId, name } });
      setMinted({ token: result.token, name: result.name });
      setOrgId("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mint gateway key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Gateway keys</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Mint <code className="font-mono text-xs">cgw_</code> keys for tenant organizations. These
        keys authenticate gateway-container traffic to the public ingest endpoint.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="Organization UUID"
            required
            className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (optional)"
            maxLength={60}
            className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || !orgId.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Mint cgw_ key
          </button>
        </div>
        {error ? (
          <p className="rounded-xl border border-destructive/40 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {minted ? <MintedPanel token={minted.token} name={minted.name} onDismiss={() => setMinted(null)} /> : null}
    </Shell>
  );
}

function MintedPanel({
  token,
  name,
  onDismiss,
}: {
  token: string;
  name: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-6">
      <p className="text-sm font-semibold">Copy this key now</p>
      <p className="mt-1 text-xs text-muted-foreground">
        It will not be shown again. Store it in the tenant's secret manager — if lost, mint a new
        one and revoke the old key.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Name: <span className="font-medium text-foreground">{name}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
          {token}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(token);
            setCopied(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 text-xs text-muted-foreground underline hover:text-foreground"
      >
        I've stored it
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">{children}</div>;
}
