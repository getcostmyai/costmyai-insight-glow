import { isBestRow, type MechanismKind, type WorkloadGroup, type WorkloadOption } from "@/lib/dashboard/group";
import { usd } from "@/lib/dashboard-data";

/**
 * Dispatch 231 — a finding that is real but claimed elsewhere.
 *
 * Every list counts its findings in the section badge, so a list may not
 * silently drop the cards those findings produced. A row whose workload is
 * better served by another option still renders; it simply carries no action,
 * and says where the money is actually claimed instead. One decision, one
 * button, but nothing disappears from the page that the badge counted.
 *
 * Proven first on Rightsize (Dispatch 230); this module is that pattern made
 * shared so Compare, Certify and the transparency lists cannot drift from it.
 */

export const SUPERSEDE_PAGE: Record<MechanismKind, string> = {
  host_arbitrage: "Compare",
  quality_match: "Certify",
  rightsize: "Rightsize",
};

export const SUPERSEDE_ACTION: Record<MechanismKind, string> = {
  host_arbitrage: "same model on a cheaper host",
  quality_match: "quality-match",
  rightsize: "right-size",
};

/**
 * The option that claims this workload's money instead of the row being drawn,
 * or null when the row *is* the best option and stays actionable.
 *
 * `group` is whatever view the calling level is entitled to see — Compare
 * passes its arbitrage-only view, so a locked mechanism can never leak a model
 * name into a cross-reference.
 */
export function supersededOption(
  group: WorkloadGroup | null,
  self: { kind: MechanismKind; toModel: string; toHost: string },
): WorkloadOption | null {
  if (isBestRow(group, self)) return null;
  return group ? group.best : null;
}

/** Disclosure-only footer: what wins this workload, where, and for how much. */
export function SupersededNote({
  option,
  here = false,
  className = "",
}: {
  option: WorkloadOption;
  /** The better option lives on this same page, so do not send the reader away. */
  here?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">
        {here ? (
          <>Already addressed on this page</>
        ) : (
          <>
            Already addressed under{" "}
            <span className="font-semibold text-foreground">{SUPERSEDE_PAGE[option.kind]}</span>
          </>
        )}{" "}
        — {SUPERSEDE_ACTION[option.kind]} to{" "}
        <span className="font-mono text-foreground">{option.toModel}</span>
        {option.toHostLabel || option.toHost ? (
          <span> on {option.toHostLabel || option.toHost}</span>
        ) : null}
        , <span className="num text-saving">{usd(option.saving, 2)}</span>.
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Counted once, here and there — activate it where it is best.
      </p>
    </div>
  );
}
