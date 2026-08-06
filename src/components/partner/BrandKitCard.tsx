import { useState } from "react";
import { BadgeCheck, Check, Copy, Download, Loader2 } from "lucide-react";

import { getMyPartnerBanner } from "@/lib/partner-badge.functions";

/**
 * Badge and banner downloads.
 *
 * Nothing here is a static file: each image is rendered on request from the
 * caller's own partner record. The button being visible is not the access
 * control — the endpoint refuses anyone who is not the partner themselves.
 */

type Format = "badge" | "personal" | "company";

const ITEMS: { format: Format; title: string; spec: string; body: string }[] = [
  {
    format: "badge",
    title: "Certified Partner badge",
    spec: "600 × 600 PNG",
    body: "For your site, signature or deck. Pair it with the verification link below so anyone can check it.",
  },
  {
    format: "personal",
    title: "LinkedIn profile banner",
    spec: "1584 × 396 PNG",
    body: "Your name and tier sit on the right half, clear of the circular profile photo LinkedIn drops over the lower left.",
  },
  {
    format: "company",
    title: "LinkedIn company page cover",
    spec: "4200 × 700 PNG",
    body: "Centred layout with wide side margins, so LinkedIn's crop on narrow layouts never cuts into the wordmark.",
  },
];

export function BrandKitCard({ referralCode, active }: { referralCode: string; active: boolean }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const verifyUrl =
    typeof window === "undefined"
      ? `/partner/verify/${referralCode}`
      : `${window.location.origin}/partner/verify/${referralCode}`;

  async function download(format: Format) {
    setBusy(format);
    setError(null);
    try {
      const file = await getMyPartnerBanner({ data: { format } });
      const a = document.createElement("a");
      a.href = file.dataUrl;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate that image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Certified Partner badge and banners</h2>
      </div>

      {!active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Your badge is issued the moment your partner account is activated. Nothing is downloadable
          before then, and the verification link stays a dead end — that is what makes it worth
          anything.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Every image is generated from your live partner record and carries your verification
            link. The link resolves to a page on costmyai.com showing your name, tier and join date —
            anyone can check it, and nobody can fake it.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {verifyUrl}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(verifyUrl);
                setCopied(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy verification link"}
            </button>
            <a
              href={verifyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Open it
            </a>
          </div>

          <div className="mt-5 space-y-2">
            {ITEMS.map((item) => (
              <div
                key={item.format}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.title}{" "}
                    <span className="ml-1 text-xs font-normal text-muted-foreground tabular-nums">
                      {item.spec}
                    </span>
                  </p>
                  <p className="mt-1 max-w-xl text-xs text-muted-foreground">{item.body}</p>
                </div>
                <button
                  onClick={() => void download(item.format)}
                  disabled={busy !== null}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy === item.format ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download
                </button>
              </div>
            ))}
          </div>

          {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
        </>
      )}
    </section>
  );
}
