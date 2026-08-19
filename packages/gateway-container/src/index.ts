#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";

import { CONTAINER_DEFAULTS, loadConfig, type ContainerConfig } from "./config.js";
import { REMOTE_POOL_WIDTH, RemoteClassifier } from "./classify-remote.js";
import { handleProxy } from "./proxy.js";
import { UpstreamQueue } from "./queue.js";
import { Spool } from "./spool.js";
import { SwitchMap } from "./switch-map.js";

/**
 * Entrypoint.
 *
 * A pass-through proxy in front of one provider. Your key never leaves your
 * environment; only metadata (model, host, token counts, latency, status)
 * goes to CostMyAI, asynchronously, off the request path.
 */

function log(message: string, extra: Record<string, unknown> = {}): void {
  // Structured, and never given anything credential-bearing to print.
  console.log(JSON.stringify({ t: new Date().toISOString(), msg: message, ...extra }));
}

export function createGateway(config: ContainerConfig) {
  const spool = new Spool(config.spoolDir, {
    maxItems: config.spoolMaxItems,
    maxAgeMs: config.spoolMaxAgeMs,
  });
  const queue = new UpstreamQueue(config, fetch, config.spoolMaxItems);
  const restored = spool.load();
  if (restored.length) {
    queue.restore(restored);
    log("spool restored", { items: restored.length });
  }

  // Control channel (Dispatch 155). The request path reads this map
  // synchronously, from memory only (Stage 4). Its whole contract is that an
  // outage here is indistinguishable, from the customer's traffic's point of
  // view, from us not existing: no fresh plan means byte-identical pass-through.
  const switches = new SwitchMap(config, fetch);
  const stopSwitchPoll = switches.start(config.switchPollIntervalMs);

  let lastError: string | undefined;
  let lastFlushAt: string | undefined;

  async function flush(): Promise<void> {
    if (queue.size === 0) return;
    const report = await queue.drain();
    lastError = report.lastError;
    if (report.sent > 0) lastFlushAt = new Date().toISOString();
    if (report.lastError) log("upstream flush incomplete", { queued: report.remaining, error: report.lastError });
    spool.persist(queue.snapshot());
  }

  const server = createServer((req, res) => {
    void serve(req, res).catch((err: unknown) => {
      log("request failed", { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "costmyai_proxy_error" } }));
    });
  });

  async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);

    if (url.pathname === "/healthz" || url.pathname === "/__costmyai/health") {
      const body = JSON.stringify({
        ok: true,
        upstream: new URL(config.upstreamUrl).host,
        queued: queue.size,
        lastFlushAt: lastFlushAt ?? null,
        lastError: lastError ?? null,
        switches: switches.status(),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }

    const response = await handleProxy(toWebRequest(req, url), {
      config,
      queue,
      switchMap: switches,
      remote,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body) await response.body.pipeTo(Writable.toWeb(res) as WritableStream<Uint8Array>);
    else res.end();
  }

  /**
   * Dispatch 236. Built once, and only when the operator turned remote
   * classification on — an off container has no classifier object at all, so
   * the remote path is unreachable rather than merely unused.
   */
  const remote = config.classifyRemote ? new RemoteClassifier({ config }) : undefined;
  if (remote) {
    log("remote task classification enabled", {
      pool: REMOTE_POOL_WIDTH,
      note: "prompt text is sent to CostMyAI for labelling, off the request path",
    });
  }

  const timer = setInterval(() => void flush(), config.flushIntervalMs);
  timer.unref?.();

  async function shutdown(signal: string): Promise<void> {
    log("shutting down", { signal, queued: queue.size });
    clearInterval(timer);
    stopSwitchPoll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    spool.persist(queue.snapshot());
    await flush();
    spool.persist(queue.snapshot());
    log("shutdown complete", { queued: queue.size });
  }

  return { server, queue, spool, switches, flush, shutdown };
}

function toWebRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  // `duplex: "half"` is required by Node/undici for a streamed request body and
  // is absent from the DOM RequestInit type this repo typechecks against.
  return new Request(url.toString(), {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

const isEntrypoint = process.argv[1]?.includes("index");
if (isEntrypoint) {
  const config = loadConfig();
  const gateway = createGateway(config);
  gateway.server.listen(config.port, () => {
    log("costmyai gateway listening", {
      port: config.port,
      upstream: new URL(config.upstreamUrl).host,
      app: config.baseUrl,
      /**
       * Dispatch 237. This used to print `:v1` unconditionally, from a constant
       * in the shared contract — so a customer running the `v2` or `v3` image
       * read a startup line telling them they were running `v1`. One codebase
       * builds all three lines, so the tag is not knowable from inside; the
       * posture is, and the posture is the thing that actually differs.
       */
      image: CONTAINER_DEFAULTS.image,
      classify: config.classifyRemote ? "local+remote" : config.classifyLocal ? "local" : "off",
    });

  });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void gateway.shutdown(signal).then(() => process.exit(0));
    });
  }
}
