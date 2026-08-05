import { classifyTask, isInScope } from "./classify.js";
import type { ContainerConfig } from "./config.js";
import { readUsage, StreamUsageCollector, type UsageReading } from "./parse.js";
import type { UpstreamQueue } from "./queue.js";

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
}

export interface ProxyEvent {
  occurred_at: string;
  model_key: string;
  host: string;
  task_hint: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status: "ok" | "error";
  parse_status: "parsed" | "tokens_only" | "unparsed";
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

  const startedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(target.toString(), {
      method: request.method,
      headers,
      body: bodyBytes as unknown as undefined,
      signal: controller.signal,
      redirect: "manual",
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = controller.signal.aborted;
    // Not retried, on purpose. The caller decides — they own the idempotency
    // of their own workload; we must not double-execute a paid completion.
    record(deps, {
      startedAt,
      now,
      uuid,
      host: upstream.host,
      path: incoming.pathname,
      model: requestedModel,
      reading: null,
      status: "error",
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
      { status: 504, headers: { "content-type": "application/json" } },
    );
  }
  clearTimeout(timeout);

  const outHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });

  const status = response.status >= 400 ? "error" : "ok";
  const inScope = isInScope(incoming.pathname);

  // Errors pass through byte-identically: provider status, provider body.
  if (!response.body || !inScope) {
    const buffered = response.body ? await response.arrayBuffer() : null;
    record(deps, {
      startedAt,
      now,
      uuid,
      host: upstream.host,
      path: incoming.pathname,
      model: requestedModel,
      reading: null,
      status,
      skip: !inScope,
    });
    return new Response(buffered, { status: response.status, headers: outHeaders });
  }

  // True streaming: the caller's bytes are never held. One branch goes straight
  // to them, the other feeds a bounded 16KB head/tail window (parse.ts).
  const [toCaller, toMeter] = response.body.tee();
  void meter(toMeter, {
    onDone: (reading) =>
      record(deps, {
        startedAt,
        now,
        uuid,
        host: upstream.host,
        path: incoming.pathname,
        model: reading.model ?? requestedModel,
        reading,
        status,
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
  skip?: boolean;
}

function record(deps: ProxyDeps, args: RecordArgs): void {
  if (args.skip) return;
  const event: ProxyEvent = {
    occurred_at: new Date(args.startedAt).toISOString(),
    // An unidentifiable model is still reported under an honest placeholder.
    // Dropping it would turn "we could not read this" into "you sent nothing".
    model_key: (args.model ?? "unknown").slice(0, 120),
    host: args.host.slice(0, 120),
    task_hint: classifyTask(args.path, args.model),
    input_tokens: args.reading?.inputTokens ?? 0,
    output_tokens: args.reading?.outputTokens ?? 0,
    latency_ms: Math.max(0, args.now() - args.startedAt),
    status: args.status,
    parse_status: args.reading?.parseStatus ?? "unparsed",
    idempotency_key: args.uuid(),
  };
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
