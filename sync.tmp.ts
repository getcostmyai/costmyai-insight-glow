import { syncArtificialAnalysis } from "./src/lib/benchmarks/aa-sync.server";
console.log(JSON.stringify(await syncArtificialAnalysis(), null, 2));
