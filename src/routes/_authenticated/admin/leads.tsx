import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { listLeads, setLeadStatus, type LeadRow } from "@/lib/intelligence/leads.functions";

export const Route = createFileRoute("/_authenticated/admin/leads")({
  head: () => ({
    meta: [
      { title: "Intelligence lead queue — CostMyAI internal" },
      {
        name: "description",
        content:
          "Detector output waiting on an editorial decision, with the evidence behind each lead.",
      },
      { property: "og:title", content: "Intelligence lead queue" },
      { property: "og:description", content: "Internal editorial queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadsPage,
});

const STATUS_STYLE: Record<string, string> = {
  open: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
  accepted: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  dismissed: "bg-muted text-muted-foreground ring-border",
  written: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
};

const FILTERS = ["open", "accepted", "written", "dismissed", "all"] as const;

function LeadsPage() {
  const read = useServerFn(listLeads);
  const triage = useServerFn(setLeadStatus);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["intelligence-leads"],
    queryFn: () => read({ data: undefined }),
    retry: false,
  });

  const mutate = useMutation({
    mutationFn: (input: { id: string; status: string }) => triage({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence-leads"] }),
  });

  const leads = (data?.leads ?? []).filter((l) => filter === "all" || l.status === filter);
  const byDetector = new Map<string, LeadRow[]>();
  for (const l of leads) byDetector.set(l.detectorLabel, [...(byDetector.get(l.detectorLabel) ?? []), l]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lightbulb className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-[0.14em]">Internal</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Intelligence lead queue</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            What the detectors found, with the evidence attached. A lead is a pointer, not a claim:
            the provenance label is decided here, by a person, when it becomes a note.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ring-1 transition ${
              filter === f
                ? "bg-foreground text-background ring-foreground"
                : "text-muted-foreground ring-border hover:text-foreground"
            }`}
          >
            {f}
            {f !== "all" ? ` (${(data?.leads ?? []).filter((l) => l.status === f).length})` : ""}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in this state.</p>
      ) : (
        <div className="space-y-10">
          {[...byDetector.entries()].map(([label, rows]) => (
            <section key={label}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {label} · {rows.length}
              </h2>
              <div className="divide-y divide-border border-y border-border">
                {rows.map((lead) => (
                  <article key={lead.id} className="py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLE[lead.status] ?? ""}`}
                      >
                        {lead.status}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {lead.severity} · last seen {lead.lastSeenAt.slice(0, 10)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold tracking-tight">{lead.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{lead.summary}</p>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Evidence
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                        {JSON.stringify(lead.evidence, null, 2)}
                      </pre>
                    </details>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {["accepted", "written", "dismissed", "open"]
                        .filter((s) => s !== lead.status)
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={mutate.isPending}
                            onClick={() => mutate.mutate({ id: lead.id, status: s })}
                            className="rounded-full border border-border px-3 py-1 text-xs font-medium capitalize text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                          >
                            {s === "open" ? "reopen" : s}
                          </button>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
