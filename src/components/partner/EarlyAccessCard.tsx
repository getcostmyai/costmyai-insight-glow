import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { getPartnerEarlyAccess } from "@/lib/partner-early.functions";

/**
 * The early-access surface, and the only claim we make about it.
 *
 * The public Intelligence page publishes a month only after it is frozen.
 * These are the same figures for the month that is still running, which nobody
 * outside the partner program can see yet. That is a small promise, and it is
 * a true one.
 */
export function EarlyAccessCard() {
  const q = useQuery({
    queryKey: ["partner-early-access"],
    queryFn: () => getPartnerEarlyAccess(),
  });

  if (q.isPending || q.isError || !q.data) return null;
  const d = q.data;

  return (
    <section className="mt-6 rounded-2xl border border-primary/40 bg-card p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Partner early access · {d.monthLabel}</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        The public Intelligence page only publishes a month once it is frozen. You see this month
        while it is still moving — the same figures, before anyone else.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Figure label="Price moves" value={d.changesTotal} />
        <Figure label="Increases" value={d.increases} tone="text-red-400" />
        <Figure label="Cuts" value={d.decreases} tone="text-emerald-400" />
        <Figure label="New listings" value={d.newListings} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground tabular-nums">
        Across {d.liveModels.toLocaleString()} live models on {d.liveHosts.toLocaleString()} hosts ·
        read {new Date(d.generatedAt).toLocaleString()}. Still moving, so these figures can change
        before the month is frozen.
      </p>
    </section>
  );
}

function Figure({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
