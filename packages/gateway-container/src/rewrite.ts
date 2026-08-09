import type { SwitchLookup } from "./switch-map.js";

/**
 * Request rewriting (Dispatch 155, Stage 4).
 *
 * This is the first code in the container that is allowed to change a
 * customer's request, so it is deliberately the narrowest thing that can work:
 *
 *  - It only ever changes ONE string: the `model` field of a JSON body.
 *  - It only does that for a Phase 1 switch, i.e. a same-host model swap where
 *    the container already fronts the destination with the customer's own key.
 *  - Everything it does not completely understand is REFUSED, and a refusal
 *    means the original request is forwarded byte-for-byte. There is no
 *    best-effort path here; a half-understood rewrite is the failure mode this
 *    file exists to prevent.
 *
 * Refusals are disclosed on the response, never swallowed: a customer must be
 * able to see that a switch they enabled did not move a given request, and
 * why.
 */

export type RewriteRefusal =
  /** Phase 2/3 (cross-provider, Bedrock, Vertex) is not built yet. */
  | "phase_not_supported"
  /** A SigV4-signed request. Editing the body invalidates the signature. */
  | "signed_request"
  /** Gemini/Bedrock-style shapes name the model in the URL, not the body. */
  | "model_in_path"
  /** Not JSON, or no string `model` field to replace. */
  | "unrecognized_shape";

export interface RewriteOutcome {
  /** New body bytes. Present only when `rerouted` is true. */
  body?: Uint8Array;
  rerouted: boolean;
  refusal?: RewriteRefusal;
  /** Disclosure headers for the caller. Always non-empty when a switch matched. */
  disclosure: Record<string, string>;
}

const PASS: RewriteOutcome = { rerouted: false, disclosure: {} };

/** Headers that mark a request as cryptographically signed over its body. */
function isSigned(headers: Headers): boolean {
  const auth = headers.get("authorization") ?? "";
  if (/^AWS4-HMAC-SHA256/i.test(auth)) return true;
  for (const name of ["x-amz-content-sha256", "x-amz-date", "x-goog-signature"]) {
    if (headers.has(name)) return true;
  }
  return false;
}

/** True when the model identifier lives in the URL rather than the JSON body. */
export function modelIsInPath(path: string): boolean {
  return /\/models?\/[^/:?]+/i.test(path);
}

export function planRewrite(input: {
  lookup: SwitchLookup | null;
  path: string;
  headers: Headers;
  body: Uint8Array | undefined;
  originalModel: string | null;
  originalHost: string;
}): RewriteOutcome {
  const { lookup } = input;
  if (!lookup) return PASS;

  const refuse = (refusal: RewriteRefusal): RewriteOutcome => ({
    rerouted: false,
    refusal,
    disclosure: {
      "x-costmyai-reroute": "refused",
      "x-costmyai-reroute-refused": refusal,
      "x-costmyai-switch": lookup.id,
    },
  });

  // Phase 1 only. Phase 2 (granted cross-provider) and Phase 3 (Bedrock,
  // Vertex) are refused here explicitly rather than being unreachable by
  // accident: the server marks them non-executable today, and the container
  // refuses them independently even if a future plan says otherwise.
  if (lookup.phase !== 1) return refuse("phase_not_supported");
  if (isSigned(input.headers)) return refuse("signed_request");
  if (modelIsInPath(input.path)) return refuse("model_in_path");
  if (!input.body || input.body.byteLength === 0) return refuse("unrecognized_shape");

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(input.body));
  } catch {
    return refuse("unrecognized_shape");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return refuse("unrecognized_shape");
  }
  const obj = parsed as Record<string, unknown>;
  const field = typeof obj["model"] === "string" ? "model" : typeof obj["modelId"] === "string" ? "modelId" : null;
  if (!field) return refuse("unrecognized_shape");

  obj[field] = lookup.target.model_key;
  return {
    rerouted: true,
    body: new TextEncoder().encode(JSON.stringify(obj)),
    disclosure: {
      "x-costmyai-reroute": "applied",
      "x-costmyai-switch": lookup.id,
      "x-costmyai-original-model": input.originalModel ?? "unknown",
      "x-costmyai-original-host": input.originalHost,
      "x-costmyai-model": lookup.target.model_key,
      "x-costmyai-host": lookup.target.host,
    },
  };
}
