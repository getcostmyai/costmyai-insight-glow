import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { Chip, Label } from "./estimator-ui";
import type { EstimatorOptions } from "@/lib/estimator.functions";
import {
  MAX_LINES,
  canAddLine,
  resizeBoundary,
  startingShare,
  unallocatedPct,
  type DraftLine,
} from "@/lib/estimator/lines";
import { WORKLOADS, type WorkloadId } from "@/lib/estimator/spec";

/**
 * The allocation bar.
 *
 * One total spend, carved into named lines plus an explicit remainder that is
 * never priced. Every named line shows its own workload, provider and model
 * inline, so the bar is the breakdown rather than a picture of one. A line is
 * always carved out of the remainder and, when removed, gives that exact share
 * back to it — dragging is the only thing that ever moves spend between two
 * named lines, and only between the two either side of the handle.
 */

const SEGMENT_TONES = [
  "bg-primary/85",
  "bg-saving/85",
  "bg-primary/60",
  "bg-saving/60",
  "bg-primary/40",
  "bg-saving/40",
];

export interface LineDraft {
  workload: WorkloadId;
  provider: string | null;
  modelKey: string | null;
}

export interface AllocationBarProps {
  lines: DraftLine[];
  totalSpendUsd: number;
  options: EstimatorOptions | undefined;
  /** Live update while dragging — no telemetry, no commit. */
  onLinesChange: (lines: DraftLine[]) => void;
  /** Fired once on pointer release, with the real before/after shares. */
  onResizeCommit: (before: DraftLine[], after: DraftLine[], boundaryIndex: number) => void;
  onAddLine: (draft: LineDraft) => void;
  onEditLine: (id: string, draft: LineDraft) => void;
  onRemoveLine: (id: string) => void;
}

export function AllocationBar(props: AllocationBarProps) {
  const { lines, totalSpendUsd, options, onLinesChange, onResizeCommit } = props;
  const remainder = unallocatedPct(lines);
  const addState = canAddLine(lines);

  const [picker, setPicker] = useState<{ mode: "add" | "edit"; id?: string; draft: LineDraft } | null>(
    null,
  );

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ index: number; before: DraftLine[] } | null>(null);

  const dollars = (pct: number) =>
    `$${new Intl.NumberFormat("en-US").format(Math.round((totalSpendUsd * pct) / 100))}`;

  /* ------------------------------ dragging ------------------------------ */

  /**
   * The window listeners are registered once and read everything they need
   * through refs. Binding them to freshly-created callbacks would tear them
   * down on the very first re-render the drag itself causes, which silently
   * turns a drag into a single click.
   */
  const latestRef = useRef(lines);
  const changeRef = useRef(onLinesChange);
  const commitRef = useRef(onResizeCommit);
  useEffect(() => {
    latestRef.current = lines;
    changeRef.current = onLinesChange;
    commitRef.current = onResizeCommit;
  });

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const track = trackRef.current;
      if (!drag || !track) return;
      const rect = track.getBoundingClientRect();
      const pct = ((event.clientX - rect.left) / rect.width) * 100;
      // The pointer marks the boundary, so the left segment's new size is the
      // pointer minus every segment ahead of it.
      const preceding = drag.before
        .slice(0, drag.index)
        .reduce((sum, l) => sum + l.sharePct, 0);
      changeRef.current(resizeBoundary(drag.before, drag.index, pct - preceding));
    };
    const up = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag) commitRef.current(drag.before, latestRef.current, drag.index);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const startDrag = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    dragRef.current = { index, before: lines };
  };

  /** Keyboard equivalent: one percent per press, committed on each press. */
  const nudge = (index: number, delta: number) => {
    const before = lines;
    const sizes = [...lines.map((l) => l.sharePct), remainder];
    const next = resizeBoundary(before, index, sizes[index] + delta);
    onLinesChange(next);
    onResizeCommit(before, next, index);
  };

  /* ------------------------------- render ------------------------------- */

  const segments = [
    ...lines.map((line, i) => ({
      key: line.id,
      kind: "line" as const,
      pct: line.sharePct,
      tone: SEGMENT_TONES[i % SEGMENT_TONES.length],
      label: WORKLOADS.find((w) => w.id === line.workload)?.label ?? line.workload,
    })),
    {
      key: "unallocated",
      kind: "unallocated" as const,
      pct: remainder,
      tone: "bg-secondary",
      label: "Not itemised",
    },
  ].filter((s) => s.kind === "line" || s.pct > 0);

  let running = 0;
  const boundaries = segments.slice(0, -1).map((s, i) => {
    running += s.pct;
    return { index: i, at: running };
  });

  const modelName = (key: string | null) =>
    key ? (options?.models.find((m) => m.model_key === key)?.display_name ?? key) : null;

  return (
    <div>
      <Label>Break the spend down</Label>

      {lines.length === 0 ? (
        <div
          data-testid="alloc-empty"
          className="flex h-12 items-center justify-center rounded-xl border border-dashed border-border bg-secondary text-sm text-muted-foreground"
        >
          Your spend, not yet broken down.
        </div>
      ) : (
        <div ref={trackRef} className="relative h-12 w-full overflow-hidden rounded-xl bg-secondary">
          <div className="flex h-full w-full">
            {segments.map((s) => (
              <div
                key={s.key}
                data-testid="alloc-segment"
                data-kind={s.kind}
                data-share={s.pct}
                data-label={s.label}
                style={{ width: `${s.pct}%` }}
                className={`flex h-full min-w-0 items-center justify-center overflow-hidden border-r border-background/60 last:border-r-0 ${s.tone} ${
                  s.kind === "unallocated" ? "border border-dashed border-border" : ""
                }`}
              >
                {s.pct >= 9 ? (
                  <span
                    className={`truncate px-2 text-[11px] font-semibold tracking-tight ${
                      s.kind === "unallocated" ? "text-muted-foreground" : "text-background"
                    }`}
                  >
                    {s.label} · <span className="num">{s.pct}%</span>
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {boundaries.map((b) => (
            <div
              key={b.index}
              role="separator"
              aria-label={`Resize boundary ${b.index + 1}`}
              aria-valuenow={b.at}
              tabIndex={0}
              data-testid="alloc-handle"
              data-boundary={b.index}
              onPointerDown={startDrag(b.index)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") { e.preventDefault(); nudge(b.index, -1); }
                if (e.key === "ArrowRight") { e.preventDefault(); nudge(b.index, 1); }
              }}
              style={{ left: `calc(${b.at}% - 7px)` }}
              className="absolute inset-y-0 z-10 w-[14px] cursor-col-resize touch-none before:absolute before:inset-y-2 before:left-1/2 before:w-[3px] before:-translate-x-1/2 before:rounded-full before:bg-background/80"
            />
          ))}
        </div>
      )}

      {/* --------------------------- line list --------------------------- */}
      <div className="mt-4 space-y-2">
        {lines.map((line, i) => (
          <div
            key={line.id}
            data-testid="alloc-line"
            data-line-share={line.sharePct}
            data-workload={line.workload}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEGMENT_TONES[i % SEGMENT_TONES.length]}`} />
            <span className="text-sm font-semibold tracking-tight">
              {WORKLOADS.find((w) => w.id === line.workload)?.label ?? line.workload}
            </span>
            <span className="text-xs text-muted-foreground">
              {line.provider ?? "Provider not set"}
              {modelName(line.modelKey) ? ` · ${modelName(line.modelKey)}` : ""}
            </span>
            <span className="num ml-auto text-sm tabular-nums">
              {line.sharePct}%{" "}
              <span className="text-xs text-muted-foreground">· {dollars(line.sharePct)}/mo</span>
            </span>
            <button
              type="button"
              onClick={() =>
                setPicker({
                  mode: "edit",
                  id: line.id,
                  draft: { workload: line.workload, provider: line.provider, modelKey: line.modelKey },
                })
              }
              className="btn-quiet px-2.5 py-1 text-xs"
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Remove ${line.workload} line`}
              onClick={() => props.onRemoveLine(line.id)}
              className="btn-quiet px-2 py-1 text-xs"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {remainder > 0 ? (
          <p data-testid="alloc-unallocated" data-share={remainder} className="px-1 text-xs text-muted-foreground">
            <span className="num text-foreground">{remainder}%</span> · {dollars(remainder)}/mo not
            itemised. We price only what you name — the rest is left alone, not assumed.
          </p>
        ) : null}
      </div>

      {/* ----------------------------- picker ---------------------------- */}
      {picker ? (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <Label>Workload</Label>
          <div className="flex flex-wrap gap-2">
            {WORKLOADS.map((w) => (
              <Chip
                key={w.id}
                active={picker.draft.workload === w.id}
                onClick={() => setPicker({ ...picker, draft: { ...picker.draft, workload: w.id } })}
              >
                {w.label}
              </Chip>
            ))}
          </div>

          <Label className="mt-5">Provider</Label>
          <div className="flex max-h-[104px] flex-wrap gap-2 overflow-y-auto pr-1">
            <Chip
              active={picker.draft.provider === null}
              onClick={() => setPicker({ ...picker, draft: { ...picker.draft, provider: null } })}
            >
              Not sure
            </Chip>
            {(options?.providers ?? []).map((p) => (
              <Chip
                key={p.label}
                active={picker.draft.provider === p.label}
                onClick={() => setPicker({ ...picker, draft: { ...picker.draft, provider: p.label } })}
              >
                {p.label}
              </Chip>
            ))}
          </div>

          <Label className="mt-5">
            Specific model{" "}
            <span className="font-normal normal-case opacity-70">(optional, sharpens it)</span>
          </Label>
          <select
            aria-label="Specific model"
            value={picker.draft.modelKey ?? ""}
            onChange={(e) =>
              setPicker({ ...picker, draft: { ...picker.draft, modelKey: e.target.value || null } })
            }
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary/50"
          >
            <option value="">No specific model</option>
            {(options?.models ?? []).map((m) => (
              <option key={m.model_key} value={m.model_key}>
                {m.display_name}
              </option>
            ))}
          </select>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (picker.mode === "add") props.onAddLine(picker.draft);
                else props.onEditLine(picker.id!, picker.draft);
                setPicker(null);
              }}
              className="btn-gradient px-4 py-2 text-sm"
            >
              {picker.mode === "add"
                ? `Add line · ${startingShare(lines)}% of spend`
                : "Save line"}
            </button>
            <button type="button" onClick={() => setPicker(null)} className="btn-quiet px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            data-testid="alloc-add"
            disabled={!addState.ok}
            onClick={() =>
              setPicker({ mode: "add", draft: { workload: "chat", provider: null, modelKey: null } })
            }
            className="btn-quiet px-4 py-2 text-sm disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add a workload
          </button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {addState.ok
              ? `Each line is priced on its own. Up to ${MAX_LINES}; whatever you leave unallocated is never priced.`
              : addState.reason}
          </p>
        </div>
      )}
    </div>
  );
}
