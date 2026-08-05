import { createClient } from "@supabase/supabase-js";
import { summarizeMoves, type PriceHistoryRow } from "../../src/lib/intelligence/intelligence.server";

const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const { data } = await db.from("price_history")
  .select("model_key, host, change_kind, input_usd_per_mtok, output_usd_per_mtok, prev_input_usd_per_mtok, prev_output_usd_per_mtok, pct_change, observed_at")
  .eq("model_key", "qwen/qwen3-vl-235b-a22b-thinking")
  .in("change_kind", ["increase", "decrease"])
  .order("observed_at", { ascending: false });
const { moves } = summarizeMoves((data ?? []) as unknown as PriceHistoryRow[], new Map());
for (const m of moves) {
  const l = (data as any[]).find((r) => r.observed_at === m.observedAt);
  console.log(`${m.observedAt}  ${m.kind.padEnd(8)} page=${m.pct >= 0 ? "+" : ""}${m.pct}%  ledger=${l.pct_change}%  [input ${m.inputPrev}->${m.inputNow} = ${m.inputPct?.toFixed(1)}% | output ${m.outputPrev}->${m.outputNow} = ${m.outputPct?.toFixed(2)}%]`);
}
