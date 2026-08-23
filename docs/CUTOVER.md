# Domain cutover runbook — repointing costmyai.com at this deployment

Written after Dispatch 124, where `CONTAINER_DEFAULTS.appUrl` named a hostname
with no DNS record at all. Nothing broke loudly: containers proxied inference
perfectly and spooled metadata to disk forever. The customer sees a working
proxy, we see an empty dashboard, and no test catches it because internal tests
point the container at a local server.

**Getting this wrong a second time at cutover reproduces exactly that bug.** The
whole point of this file is that the DNS change and the constant change are one
task, not two.

## The one constant that matters

`src/lib/ingest/contract.ts` → `CONTAINER_DEFAULTS.appUrl`

Current value:

```
https://www.costmyai.com
```

This is the stable production URL: immutable across project renames, and the
address external callers are meant to use. Every surface renders from it — the
Settings quickstart, the generated `docker run`, `packages/gateway-container/README.md`,
`CONNECT.md`. There is no second copy to update, and there must never be one.

## Order of operations (do not reorder)

1. Point `www.costmyai.com` (and/or `app.costmyai.com`) at this deployment and
   wait for it to actually serve the app — not the old marketing site.
2. Prove it independently, before touching any code:
   ```
   curl -s https://<new-domain>/api/public/build-info
   ```
   It must return JSON containing a `fingerprint`. HTML, a redirect to the old
   site, or a 404 means the cutover is not finished. **Stop here.**
3. Only then change `CONTAINER_DEFAULTS.appUrl` to the new origin (no trailing
   slash, `https://`, no path).
4. Run `bun scripts/audit/onboarding.ts`. It must be all PASS.
5. Publish. Re-run the audit against the published build.
6. Re-copy the quickstart from `/settings` as a stranger would and confirm the
   `docker run` now contains the new domain.

## Containers already in the field

An existing customer container has the old base URL baked into its
`COSTMYAI_BASE_URL` env var. It keeps working only as long as the old address
keeps answering. **Do not retire the `project--…lovable.app` origin** when the
custom domain goes live — leave it serving. Migrating a customer means handing
them a new `docker run`; their spool drains on restart, so no events are lost
as long as the old origin stayed up until they switched.

## What the standing check catches

`scripts/audit/onboarding.ts` (in `bun run audit`) resolves the literal value of
`CONTAINER_DEFAULTS.appUrl` — not a hardcoded URL — so it audits whatever the
constant says at the time it runs. It fails on all three cutover failure modes:

| Failure at cutover | What the check does |
| --- | --- |
| Constant points at a domain with no DNS / nothing deployed | `base URL resolves` FAILs — connection error or non-2xx |
| Domain answers 200 but still serves the **old marketing site** | `base URL resolves` FAILs — 200 with no build fingerprint is treated as "not this app" |
| Domain serves this app but an **older build** | `base URL serves the current build` FAILs — served fingerprint ≠ working tree |
| Ingest route missing or wide open on the new domain | `events/billing endpoint live and authenticated` FAILs — must answer 401/403 |
| Constant updated but the quickstart snippet drifted | `docker run snippet uses the live base URL` FAILs |

That covers the silent case specifically: a 200-but-wrong-app response, which
is the most likely half-cutover state and the one a naive reachability ping
would have called healthy.
