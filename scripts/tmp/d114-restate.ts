import { freezeMonth, readFrozenMonth } from "../../src/lib/intelligence/snapshot.server";

const before = await readFrozenMonth("2026-07");
console.log("in force before:", before?.id, "top increase pct:", before?.payload.topIncreases?.[0]?.pct);

const result = await freezeMonth("2026-07", {
  restate: true,
  note: "Restated (Dispatch 114): the price-move percentage in the original row was re-derived on the Intelligence page from the input side alone, which disagreed with the ledger's own blended pct_change (e.g. +145.0% published against a ledger value of +12.05%). The page now reads price_history.pct_change directly. Same window, same source rows, corrected magnitudes. The original row is preserved and superseded, never edited.",
});
console.log(result);

const after = await readFrozenMonth("2026-07");
console.log("in force after:", after?.id, "restated:", after?.restated, "top increase pct:", after?.payload.topIncreases?.[0]?.pct);
