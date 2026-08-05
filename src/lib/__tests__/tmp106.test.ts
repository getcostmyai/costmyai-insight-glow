import { it, expect } from "vitest";
import { ingestEventSchema } from "@/lib/ingest/schema";
import { envelopeSkeleton, isContentFree } from "../../packages/gateway-container/src/skeleton";
it("x", () => {
  const sk = envelopeSkeleton({ error: { message: "model not found", type: "invalid_request", code: 422 }, request_id: "abc" });
  console.log(JSON.stringify(sk), isContentFree(sk));
  const r = ingestEventSchema.safeParse({ model_key: "m", host: "h", input_tokens: 0, output_tokens: 0, status: "error", parse_status: "unparsed", envelope_skeleton: sk, idempotency_key: "k" });
  console.log(r.success, JSON.stringify(r.error?.issues));
});
