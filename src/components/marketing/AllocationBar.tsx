import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { Chip, Label } from "./estimator-ui";
import type { EstimatorOptions } from "@/lib/estimator.functions";
import {
  MAX_LINES,
  MIN_LINE_PCT,
  canAddLine,
  maxShareFor,
  setShare,
  startingShare,
  unallocatedPct,
  type DraftLine,
} from "@/lib/estimator/lines";
import { WORKLOADS, type WorkloadId } from "@/lib/estimator/spec";

/**
 * The allocation control.
 *
 * One total spend, split across named workloads plus an explicit remainder that
 * is never priced. Each placed workload owns a slider; the bar above is a live
 * read-out of the same state, not an input. Growth always carves out of the
 * remainder first and only encroaches on other workloads once it is gone, so a
 * visitor can reach a full allocation without ever having to clear space first.
 */

const SEGMENT_TONES = [
  "bg-primary/85",
  "bg-saving/85",
  "bg-primary/60",
  "bg-saving/60",
  "bg-primary/40",
  "bg-saving/40",
];

/**
 * Models the given provider actually serves. With no provider chosen ("Not
 * sure") there is nothing to filter by, so the full priced catalog stands.
 */
function modelsFor(options: EstimatorOptions | undefined, provider: string | null) {
  const all = options?.models ?? [];
  if (!provider) return all;
  const keys = options?.providers.find((p) => p.label === provider)?.modelKeys;
  if (!keys) return all;
  const set = new Set(keys);
  return all.filter((m) => set.has(m.model_key));
}

export interface LineDraft {
  workload: WorkloadId;
  provider: string | null;
  modelKey: string | null;
}

export interface AllocationBarProps {
  lines: DraftLine[];
  totalSpendUsd: number;
  options: EstimatorOptions | undefined;
  /** Live update while a slider moves — no telemetry, no commit. */
  onLinesChange: (lines: DraftLine[]) => void;
  /** Fired once the slider settles, with the real before/after shares. */
  onResizeCommit: (before: DraftLine[], after: DraftLine[], boundaryIndex: number) => void;
  onAddLine: (draft: LineDraft, sharePct: number) => void;
  onEditLine: (id: string, draft: LineDraft) => void;
  onRemoveLine: (id: string) => void;
}

interface PickerState {
  mode: "add" | "edit";
  id?: string;
  draft: LineDraft;
  sharePct: number;
}

export function AllocationBar(props: AllocationBarProps) {
  const { lines, totalSpendUsd, options, onLinesChange, onResizeCommit } = props;
  const remainder = unallocatedPct(lines);
  const addState = canAddLine(lines);

  const newDraft = (): PickerState => ({
    mode: "add",
    draft: { workload: "chat", provider: null, modelKey: null },
    sharePct: startingShare(lines),
  });

  // Reaching this step with nothing placed opens the picker straight away:
  // an empty bar with an "add" button is a screen that asks for a click before
  // it will let anyone do anything.
  const [picker, setPicker] = useState<PickerState | null>(() =>
    props.lines.length === 0 ? newDraft() : null,
  );

  const dollars = (pct: number) =>
    `$${new Intl.NumberFormat("en-US").format(Math.round((totalSpendUsd * pct) / 100))}`;

  /**
   * The shape the slider started from. A drag re-renders on every frame, so
   * reading "before" out of the current render would compare the settled value
   * against itself and report no change at all.
   */
  const gestureStart = useRef<DraftLine[] | null>(null);
  const beginGesture = () => {
    if (!gestureStart.current) gestureStart.current = lines;
  };
  const slide = (id: string, next: number) => onLinesChange(setShare(lines, id, next));
  const settle = (id: string, next: number) => {
    console.log("DBG settle", id, next, gestureStart.current?.map((l) => l.sharePct));
    const before = gestureStart.current ?? lines;
    gestureStart.current = null;
    const after = setShare(before, id, next);
    onLinesChange(after);
    onResizeCommit(before, after, before.findIndex((l) => l.id === id));
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
  ];

  const modelName = (key: string | null) =>
    key ? (options?.models.find((m) => m.model_key === key)?.display_name ?? key) : null;

  const pickerMax = picker
    ? picker.mode === "edit"
      ? maxShareFor(lines, picker.id)
      : maxShareFor(lines)
    : 100;

  return (
    <div>
      <Label>Split it across your workloads</Label>

      {lines.length === 0 ? (
        <div
          data-testid="alloc-empty"
          className="flex h-12 items-center justify-center rounded-xl border border-dashed border-border bg-secondary text-sm text-muted-foreground"
        >
          Your spend, not yet split across workloads.
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="relative h-12 w-full overflow-hidden rounded-xl bg-secondary"
        >
          <div className="flex h-full w-full">
            {segments.map((s) => (
              <div
                key={s.key}
                data-testid="alloc-segment"
                data-kind={s.kind}
                data-share={s.pct}
                data-label={s.label}
                style={{ width: `${s.pct}%` }}
                className={`flex h-full min-w-0 items-center justify-center overflow-hidden border-r border-background/60 transition-[width] duration-150 last:border-r-0 ${s.tone} ${
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
        </div>
      )}

      {/* ------------------------- workload sliders ------------------------ */}
      <div className="mt-4 space-y-2">
        {lines.map((line, i) => {
          const label = WORKLOADS.find((w) => w.id === line.workload)?.label ?? line.workload;
          
          return (
            <div
              key={line.id}
              data-testid="alloc-line"
              data-line-share={line.sharePct}
              data-workload={line.workload}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEGMENT_TONES[i % SEGMENT_TONES.length]}`}
                />
                <span className="text-sm font-semibold tracking-tight">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {line.provider ?? "Provider not set"}
                  {modelName(line.modelKey) ? ` · ${modelName(line.modelKey)}` : ""}
                </span>
                <span className="num ml-auto text-sm tabular-nums">
                  {line.sharePct}%{" "}
                  <span className="text-xs text-muted-foreground">
                    · {dollars(line.sharePct)}/mo
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPicker({
                      mode: "edit",
                      id: line.id,
                      draft: {
                        workload: line.workload,
                        provider: line.provider,
                        modelKey: line.modelKey,
                      },
                      sharePct: line.sharePct,
                    })
                  }
                  className="btn-quiet px-2.5 py-1 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${label} workload`}
                  onClick={() => props.onRemoveLine(line.id)}
                  className="btn-quiet px-2 py-1 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <input
                type="range"
                min={MIN_LINE_PCT}
                max={maxShareFor(lines, line.id)}
                step={1}
                value={line.sharePct}
                data-testid="alloc-slider"
                data-workload={line.workload}
                aria-label={`${label} share of spend`}
                onPointerDown={beginGesture}
                onKeyDown={beginGesture}
                onChange={(e) => slide(line.id, Number(e.target.value))}
                onPointerUp={(e) => settle(line.id, Number(e.currentTarget.value))}
                onKeyUp={(e) => settle(line.id, Number(e.currentTarget.value))}

                className="slider-brand mt-2.5 w-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${line.sharePct}%, var(--secondary) ${line.sharePct}%, var(--secondary) 100%)`,
                }}
              />
            </div>
          );
        })}

        {remainder > 0 ? (
          <p
            data-testid="alloc-unallocated"
            data-share={remainder}
            className="px-1 text-xs text-muted-foreground"
          >
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
                onClick={() =>
                  setPicker({
                    ...picker,
                    draft: {
                      ...picker.draft,
                      provider: p.label,
                      // Drop a model the new provider does not actually serve,
                      // rather than leaving a stale invalid selection behind.
                      modelKey:
                        picker.draft.modelKey && p.modelKeys.includes(picker.draft.modelKey)
                          ? picker.draft.modelKey
                          : null,
                    },
                  })
                }
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
            {modelsFor(options, picker.draft.provider).map((m) => (
              <option key={m.model_key} value={m.model_key}>
                {m.display_name}
              </option>
            ))}
          </select>

          {picker.mode === "add" ? (
            <>
              <Label className="mt-5">
                Share of spend ·{" "}
                <span className="num normal-case">
                  {picker.sharePct}% · {dollars(picker.sharePct)}/mo
                </span>
              </Label>
              <input
                type="range"
                min={MIN_LINE_PCT}
                max={pickerMax}
                step={1}
                value={Math.min(picker.sharePct, pickerMax)}
                data-testid="picker-share"
                aria-label="Share of spend for this workload"
                onChange={(e) => setPicker({ ...picker, sharePct: Number(e.target.value) })}
                className="slider-brand w-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${picker.sharePct}%, var(--secondary) ${picker.sharePct}%, var(--secondary) 100%)`,
                }}
              />
            </>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              data-testid="picker-confirm"
              onClick={() => {
                if (picker.mode === "add") props.onAddLine(picker.draft, picker.sharePct);
                else props.onEditLine(picker.id!, picker.draft);
                setPicker(null);
              }}
              className="btn-gradient px-4 py-2 text-sm"
            >
              {picker.mode === "add"
                ? `Add this workload at ${Math.min(picker.sharePct, pickerMax)}%`
                : "Save this workload"}
            </button>
            {lines.length > 0 || picker.mode === "edit" ? (
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="btn-quiet px-4 py-2 text-sm"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            data-testid="alloc-add"
            disabled={!addState.ok}
            onClick={() => setPicker(newDraft())}
            className="btn-quiet px-4 py-2 text-sm disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add a workload
          </button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {addState.ok
              ? `Each workload is priced on its own. Up to ${MAX_LINES}; whatever you leave unallocated is never priced.`
              : addState.reason}
          </p>
        </div>
      )}
    </div>
  );
}
