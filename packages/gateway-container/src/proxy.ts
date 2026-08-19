import { classifyRequest, isInScope, type TaskDecision } from "./classify.js";
import { CLASSIFIER_REVISION, NO_CLASSIFIER_REVISION } from "./classify-local.js";
import type { ContainerConfig } from "./config.js";
import {
  classifyResponseFailure,
  classifyTransportFailure,
  MAX_ERROR_BODY_BYTES,
  type FallbackReason,
} from "./fallback.js";
import { readUsage, StreamUsageCollector, type UsageReading } from "./parse.js";
import type { UpstreamQueue } from "./queue.js";
import { planRewrite, type RewriteOutcome } from "./rewrite.js";
import type { SwitchMap } from "./switch-map.js";

/**
 * The proxy request path.
 *
 * Two hard rules govern everything in this file:
 *
 *  1. The customer's provider key is copied through untouched and never read,
 *     stored or logged. This container is a metadata relay, not a credential
 *     store — see DECISIONS.md §1 and §2.
 *  2. The proxied AI call is NEVER retried. A retried completion can
 *     double-execute and double-bill on the provider's side. Metadata delivery
 *     to CostMyAI retries freely; it is idempotent and costs nothing.
 */

/** Headers that may carry a credential. Never logged, never inspected. */
const CREDENTIAL_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "x-goog-api-key",
  "cookie",
  "set-cookie",
  "x-amz-security-token",
]);

/** Hop-by-hop headers that must not be forwarded verbatim. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "host",
  "content-length",
]);

/** Everything a diagnostic is allowed to see. Used by success and error paths alike. */
export function redactHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  headers.forEach((value, key) => {
    safe[key] = CREDENTIAL_HEADERS.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return safe;
}

export interface ProxyDeps {
  config: ContainerConfig;
  queue: UpstreamQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Injected for tests; production passes crypto.randomUUID. */
  uuid?: () => string;
  /**
   * The local switch plan (Dispatch 155). Optional: a container without one
   * behaves exactly as it did before Stage 4 — a byte-identical pass-through.
   */
  switchMap?: SwitchMap;
}

export interface ProxyEvent {
  occurred_at: string;
  model_key: string;
  host: string;
  task_hint: string;
  /**
   * Dispatch 234. How sure the classifier was about `task_hint`, 0..1 to two
   * decimals. Coherent by construction: `unknown` always reports 0, and any
   * real label always reports more than 0.
   */
  task_confidence?: number;
  /**
   * Revision of the classifier that produced the label — 0 when no local
   * classifier ran, so a structural label from a container with classification
   * off is never mistaken for a content-derived one.
   */
  classifier_revision?: number;
  input_tokens: number;
  output_tokens: number;
  /**
   * Dispatch 204. Subsets of `input_tokens` that the provider served from, or
   * wrote into, its prompt cache. Absent when the provider reported no cache
   * activity, so an uncached event is byte-identical to a pre-204 one.
   */
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  latency_ms: number;
  status: "ok" | "error";
  parse_status: "parsed" | "tokens_only" | "unparsed";

  /**
   * Dispatch 155. Present only on a request this container actually rewrote.
   * Absent — not false — on every untouched request, so an unrerouted event is
   * byte-identical to what a v1 container sends.
   */
  rerouted?: boolean;
  original_model_key?: string;
  original_host?: string;
  route_reason?: string;
  /**
   * Dispatch 155, Stage 5. Present only on the failed rerouted attempt that
   * caused a fallback to the caller's original model. Absent everywhere else.
   */
  fallback_reason?: FallbackReason;
  /**
   * Dispatch 106. Set only when the envelope could not be read cleanly: a
   * content-free structural skeleton (numbers and keys, every string erased)
   * so a parser shipped later can re-read the event retroactively. Absent on
   * every clean read, which is the overwhelming majority of traffic.
   */
  envelope_skeleton?: unknown;
  idempotency_key: string;
}

export async function handleProxy(request: Request, deps: ProxyDeps): Promise<Response> {
  const { config, queue } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  const incoming = new URL(request.url);
  const upstream = new URL(config.upstreamUrl);
  const target = new URL(incoming.pathname + incoming.search, upstream.origin);
  // Preserve any path prefix on the configured upstream (e.g. Azure deployments).
  if (upstream.pathname !== "/") {
    target.pathname = `${upstream.pathname.replace(/\/+$/, "")}${incoming.pathname}`;
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("host", upstream.host);

  // The body is buffered so it can be forwarded byte-for-byte AND so the model
  // identifier can be lifted from it. Only the `model` field is ever read; the
  // prompt is bytes this code path never interprets and never persists.
  const bodyBytes =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : new Uint8Array(await request.arrayBuffer());
  const requestedModel = modelFromRequest(bodyBytes, incoming.pathname);

  // Dispatch 232, Phase 1. Decided ONCE, from the caller's own original body,
  // before any rewrite: the task a customer sent is the task they sent, and a
  // switch that swaps the model must not be able to change the label the
  // workload is certified under. Content is read only with `classifyLocal`,
  // stays in this process, and only the resulting enum is ever enqueued.
  const task = classifyRequest({
    path: incoming.pathname,
    model: requestedModel,
    body: bodyBytes,
    readContent: config.classifyLocal,
  });


  // Dispatch 155, Stage 4. `lookup` is synchronous and memory-only; with no
  // fresh plan, no matching switch, or no switch map at all it returns null and
  // `planRewrite` passes the request through untouched.
  const rewrite: RewriteOutcome = planRewrite({
    lookup: deps.switchMap?.lookup(requestedModel, upstream.host) ?? null,
    path: incoming.pathname,
    headers: request.headers,
    body: bodyBytes,
    originalModel: requestedModel,
    originalHost: upstream.host,
  });
  const sentBody = rewrite.rerouted ? rewrite.body : bodyBytes;
  const sentModel = rewrite.rerouted ? (rewrite.disclosure["x-costmyai-model"] ?? requestedModel) : requestedModel;
  const reroute = rewrite.rerouted
    ? {
        rerouted: true as const,
        originalModel: requestedModel ?? "unknown",
        originalHost: upstream.host,
        switchId: rewrite.disclosure["x-costmyai-switch"] as string,
      }
    : undefined;

  /**
   * One upstream attempt. Never retried by itself — every retry in this file is
   * an explicit, disclosed fallback decided below, and there is at most one.
   */
  async function attempt(
    body: Uint8Array | undefined,
  ): Promise<
    | { ok: true; response: Response; startedAt: number }
    | { ok: false; aborted: boolean; error: unknown; startedAt: number }
  > {
    const attemptStartedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
    try {
      const response = await fetchImpl(target.toString(), {
        method: request.method,
        headers,
        body: body as unknown as undefined,
        signal: controller.signal,
        redirect: "manual",
      });
      return { ok: true, response, startedAt: attemptStartedAt };
    } catch (error) {
      return { ok: false, aborted: controller.signal.aborted, error, startedAt: attemptStartedAt };
    } finally {
      clearTimeout(timeout);
    }
  }

  let outcome = await attempt(sentBody);
  let disclosure: Record<string, string> = { ...rewrite.disclosure };
  let activeReroute = reroute;
  let modelInFlight = sentModel;
  /**
   * Set only when a rerouted attempt returned >=400 and its body had to be read
   * to classify it. Held so a response we decide NOT to fall back on is still
   * returned to the caller byte-for-byte.
   */
  let bufferedError: ArrayBuffer | null = null;

  // ---- The fallback decision (Dispatch 155, Stage 5) -------------------------
  //
  // This is the ONLY place a request is ever sent twice, and it can only be
  // reached before a single byte of any response has been handed to the caller.
  // Once the streaming response below is returned, the caller owns the bytes
  // and no retry is possible — the no-retry-after-first-byte invariant is
  // structural here, not a flag someone has to remember to check.
  if (rewrite.rerouted && reroute) {
    let reason: FallbackReason | null = null;
    let statusCode: number | null = null;
    if (!outcome.ok) {
      reason = classifyTransportFailure(outcome.aborted);
    } else if (outcome.response.status >= 400) {
      statusCode = outcome.response.status;
      bufferedError = await outcome.response.arrayBuffer();
      const text = new TextDecoder().decode(new Uint8Array(bufferedError).slice(0, MAX_ERROR_BODY_BYTES));
      reason = classifyResponseFailure(statusCode, text);
    }

    if (reason) {
      // The failed rerouted attempt is a real, reported event in its own right.
      record(deps, {
        startedAt: outcome.startedAt,
        now,
        uuid,
        host: upstream.host,
        path: incoming.pathname,
        task,
        model: sentModel,
        reading: null,
        status: "error",
        reroute,
        fallbackReason: reason,
      });
      // Told to the control plane, which pauses the switch if a workspace keeps
      // seeing this. Off the request path: enqueued, never awaited.
      queue.enqueue({
        kind: "fallbacks",
        body: {
          fallbacks: [
            {
              switch_id: reroute.switchId,
              reason,
              status_code: statusCode,
              model_key: (sentModel ?? "unknown").slice(0, 120),
              host: upstream.host.slice(0, 120),
              occurred_at: new Date(outcome.startedAt).toISOString(),
              idempotency_key: uuid(),
            },
          ],
        },
      });

      // One retry, with the caller's own original request.
      outcome = await attempt(bodyBytes);
      activeReroute = undefined;
      modelInFlight = requestedModel;
      bufferedError = null;
      disclosure = {
        "x-costmyai-reroute": "fell_back",
        "x-costmyai-reroute-fallback": reason,
        "x-costmyai-switch": reroute.switchId,
        "x-costmyai-attempted-model": rewrite.disclosure["x-costmyai-model"] ?? "unknown",
        "x-costmyai-attempted-host": rewrite.disclosure["x-costmyai-host"] ?? upstream.host,
        "x-costmyai-model": requestedModel ?? "unknown",
        "x-costmyai-original-model": requestedModel ?? "unknown",
        "x-costmyai-original-host": upstream.host,
      };
    }
  }

  if (!outcome.ok) {
    const aborted = outcome.aborted;
    const err = outcome.error;
    // Not retried, on purpose. The caller decides — they own the idempotency
    // of their own workload; we must not double-execute a paid completion.
    record(deps, {
      startedAt: outcome.startedAt,
      now,
      uuid,
      host: upstream.host,
      path: incoming.pathname,
      task,
      model: modelInFlight,
      reading: null,
      status: "error",
      reroute: activeReroute,
    });
    return new Response(
      JSON.stringify({
        error: {
          type: aborted ? "costmyai_upstream_timeout" : "costmyai_upstream_unreachable",
          message: aborted
            ? `Upstream did not respond within ${config.upstreamTimeoutMs}ms. The request was not retried — retrying a completion can double-bill you.`
            : `Could not reach ${upstream.host}: ${err instanceof Error ? err.message : String(err)}`,
        },
      }),
      {
        status: 504,
        headers: { "content-type": "application/json", ...disclosure },
      },
    );
  }

  const response = outcome.response;
  const startedAt = outcome.startedAt;

  const outHeaders = new Headers();
  response.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (HOP_BY_HOP.has(name)) return;
    // The HTTP client already decoded the body, so the provider's own
    // `content-encoding` no longer describes the bytes we are about to send.
    // Forwarding it verbatim makes the caller try to gunzip plaintext and fail
    // with `incorrect header check` — found against a real provider, Dispatch 102.
    if (name === "content-encoding" || name === "content-length") return;
    outHeaders.set(key, value);
  });
  // Disclosure, never silence: the caller can see on their own response that we
  // moved this request, what it was, and which switch did it — and can see a
  // refusal or a fallback just as plainly. Nothing here is added to an
  // untouched request.
  for (const [name, value] of Object.entries(disclosure)) outHeaders.set(name, value);
  // Dispatch 232. A customer who turned local classification on can see, per
  // request, exactly what label was derived from their own content and — when
  // nothing was derived — why it abstained. Added only under the opt-in flag,
  // so a container without it still returns a response with no `x-costmyai-*`
  // header at all.
  if (config.classifyLocal) {
    outHeaders.set("x-costmyai-task", task.hint);
    if (task.abstained) outHeaders.set("x-costmyai-task-abstained", task.abstained);
  }



  const status = response.status >= 400 ? "error" : "ok";
  const inScope = isInScope(incoming.pathname);

  // Errors pass through byte-identically: provider status, provider body.
  if (bufferedError !== null || !response.body || !inScope) {
    const buffered = bufferedError ?? (response.body ? await response.arrayBuffer() : null);
    record(deps, {
      startedAt,
      now,
      uuid,
      host: upstream.host,
      path: incoming.pathname,
      task,
      model: modelInFlight,
      reading: null,
      status,
      skip: !inScope,
      reroute: activeReroute,
    });
    return new Response(buffered, { status: response.status, headers: outHeaders });
  }

  // True streaming: the caller's bytes are never held. One branch goes straight
  // to them, the other feeds a bounded 16KB head/tail window (parse.ts).
  //
  // Past this point the caller has the response. A stream that dies halfway is
  // never retried and never falls back: the destination has already generated,
  // and may already have billed, whatever it produced.
  const [toCaller, toMeter] = response.body.tee();
  void meter(toMeter, {
    onDone: (reading) =>
      record(deps, {
        startedAt,
        now,
        uuid,
        host: upstream.host,
        path: incoming.pathname,
        task,
        model: reading.model ?? modelInFlight,
        reading,
        status,
        reroute: activeReroute,
      }),
  });

  return new Response(toCaller, { status: response.status, headers: outHeaders });
}

async function meter(
  stream: ReadableStream<Uint8Array>,
  handlers: { onDone: (reading: UsageReading) => void },
): Promise<void> {
  const collector = new StreamUsageCollector();
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      collector.feed(decoder.decode(value, { stream: true }));
    }
  } catch {
    /* a caller who disconnects mid-stream still gets whatever we read metered */
  }
  handlers.onDone(collector.finish());
}

interface RecordArgs {
  startedAt: number;
  now: () => number;
  uuid: () => string;
  host: string;
  path: string;
  model: string | null;
  reading: UsageReading | null;
  status: "ok" | "error";
  /** Decided once per request, from the caller's own body. */
  task: TaskDecision;
  skip?: boolean;
  fallbackReason?: FallbackReason;
  reroute?: { rerouted: true; originalModel: string; originalHost: string; switchId: string };
}

function record(deps: ProxyDeps, args: RecordArgs): void {
  if (args.skip) return;
  const event: ProxyEvent = {
    occurred_at: new Date(args.startedAt).toISOString(),
    // An unidentifiable model is still reported under an honest placeholder.
    // Dropping it would turn "we could not read this" into "you sent nothing".
    model_key: (args.model ?? "unknown").slice(0, 120),
    host: args.host.slice(0, 120),
    task_hint: args.task.hint,
    // Coherence is enforced here as well as at the door: an `unknown` label
    // carries no confidence, ever, whatever the decision object says.
    task_confidence:
      args.task.hint === "unknown" ? 0 : Math.round(args.task.confidence * 100) / 100,
    classifier_revision: deps.config.classifyLocal ? CLASSIFIER_REVISION : NO_CLASSIFIER_REVISION,
    input_tokens: args.reading?.inputTokens ?? 0,
    output_tokens: args.reading?.outputTokens ?? 0,
    latency_ms: Math.max(0, args.now() - args.startedAt),
    status: args.status,
    parse_status: args.reading?.parseStatus ?? "unparsed",
    idempotency_key: args.uuid(),
  };
  // Dispatch 204. Sent only when the provider actually reported cache activity,
  // so an uncached call keeps the exact byte-for-byte payload it sent before
  // this change and older containers stay valid against the same endpoint.
  if (args.reading?.cacheReadTokens) event.cache_read_tokens = args.reading.cacheReadTokens;
  if (args.reading?.cacheWriteTokens) event.cache_write_tokens = args.reading.cacheWriteTokens;

  if (args.reroute) {
    event.rerouted = true;
    event.original_model_key = args.reroute.originalModel.slice(0, 120);
    event.original_host = args.reroute.originalHost.slice(0, 120);
    event.route_reason = args.reroute.switchId;
  }
  if (args.fallbackReason) event.fallback_reason = args.fallbackReason;
  if (event.parse_status !== "parsed" && args.reading?.skeleton) {
    event.envelope_skeleton = args.reading.skeleton;
  }
  deps.queue.enqueue({ kind: "events", body: { events: [event] } });
}

/** Lift ONLY the model identifier out of a request. Never anything else. */
export function modelFromRequest(body: Uint8Array | undefined, path: string): string | null {
  // Gemini and Bedrock put the model in the path: /v1beta/models/gemini-2.0-flash:generateContent
  const fromPath = /\/models\/([^/:?]+)/i.exec(path)?.[1] ?? /\/model\/([^/:?]+)/i.exec(path)?.[1];
  if (fromPath) return decodeURIComponent(fromPath);
  if (!body || body.byteLength === 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    const model = parsed["model"] ?? parsed["modelId"];
    return typeof model === "string" ? model : null;
  } catch {
    return null;
  }
}
