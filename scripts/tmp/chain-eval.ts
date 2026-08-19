import { runEvaluation } from "@/lib/engine/evaluate.server";
const r = await runEvaluation("chain-drill");
console.log(JSON.stringify(r).slice(0,1500));
