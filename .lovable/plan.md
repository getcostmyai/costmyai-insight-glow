# ICP sharpening: who can actually connect to CostMyAI

## What we found

Today there is exactly one way in: a container the customer runs themselves, one per provider, plus a one-line change to the base URL in their own code. That is elegant, and it is also the narrowest possible door.

Research on how companies actually spend on AI in 2026 splits the market into four groups:

1. **Teams calling OpenAI/Anthropic straight from their own code.** One environment variable, done in ten minutes. This is our door, and it fits them perfectly.
2. **Teams buying AI through Amazon, Google or Microsoft's cloud.** Their calls are cryptographically signed to the cloud provider's own address, so pointing them at our container breaks the call outright. Not a config problem, a physics problem. Large regulated companies increasingly sit here.
3. **Teams already running a routing layer** (LiteLLM, Portkey, OpenRouter, Cloudflare). Technically easy to add us, but they already bought something that does part of what we do. We become a redundant extra hop unless we read *their* logs instead of adding a hop.
4. **Everyone whose AI spend is seats and hosted platforms** (ChatGPT Enterprise, Copilot, Zapier, hosted n8n, app builders). There is no traffic to intercept and no key to keep local. Never reachable by a proxy, at all.

So today's honest ICP is group 1 only: engineering-led companies, roughly seed to Series B, or agencies running client work, one or two providers, spend material enough to hurt, no gateway yet, and they own their own deploy.

## The uncomfortable challenge

Our strongest marketing promise, "your provider key never leaves your environment," is what makes group 2 and 4 unreachable, because it presumes there is a key and traffic we can sit beside. Meanwhile OpenAI and Anthropic both now publish organisation-level usage and cost APIs with real granularity: per workspace, per key, per model, per day, with cached tokens broken out separately. A read-only credential against those gives most of the "what are we spending, and where" picture with no container, no network change, and no deploy.

We already half-know this: the container has an OpenAI invoice reader inside it for reconciliation. We built the hard version of this capability and buried it in the part of the product almost nobody turns on.

## Recommended improvements, in priority order

**1. Keyless connect via provider usage APIs (the big one).**
A second way in that needs no container: the customer creates a read-only admin key at OpenAI or Anthropic, pastes it once, and we pull usage and cost daily. This turns a ten-minute engineering task into a two-minute one an ops person can do, and it opens the door for anyone who cannot deploy a container. It does not replace the container, which stays the only source of per-request truth that powers Certify and switching. Positioning: **Connect to see your numbers; install the engine to act on them.** The upgrade path is the sales motion.

**2. Be honest, publicly, about what we cannot see.**
A short compatibility page: what works today, what works in read-only mode, and what we plainly cannot measure (seats, Copilot, hosted builders). Bedrock and Vertex get an accurate "cloud cost import only, not per request" line rather than silence. Fewer wasted demos, more trust.

**3. Read from a routing layer instead of standing beside it.**
For teams already on LiteLLM or Portkey, accept their per-request logs into the same ingest we already have. Cheaper for them than a hop, and it converts a competitor's install base into our data source.

**4. Onboarding that admits the container is a project.**
The settings page hands over a token and a docker command. It should first ask what their stack looks like and then show only the path that will actually work for them, including "you cannot connect this way, here is what we can still do for you."

**5. Cloud cost import for the hyperscaler crowd.**
Monthly, coarse, resource-level. Not good enough for Certify, good enough for "your Bedrock line is up 40 percent." Lower priority, and honestly labelled as coarse.

**6. Stop calling it a technical problem in the marketing.**
The ICP language on the site should say out loud who this is for: teams who call the model APIs from their own code. Being narrow on the page is what makes the right people self-identify.

## What I'd build first

Phase 1 is item 1 plus item 2: keyless connect for OpenAI and Anthropic, and the honest compatibility page. That is the change that widens the funnel most per unit of work, and it makes every other item optional rather than urgent.

## Technical notes

- New read-only credential store per workspace, encrypted, scoped to `provider_admin_key`, never reused as an inference key and never returned to the client after creation.
- A daily pull job per connected provider hitting OpenAI `/v1/organization/costs` plus the usage endpoints, and Anthropic `/v1/organizations/cost_report` and `/v1/organizations/usage_report/messages`, written through the existing ingest and reconciliation contracts rather than a parallel path. The container's existing OpenAI reader logic is the starting point; move it server side so it works without a container.
- Records ingested this way must be marked as a distinct fidelity level, so Certify, switching and savings math keep refusing to run on data that has no per-request shape. Nothing that claims a certified switch may ever be computed from daily aggregates.
- Dashboard needs a visible fidelity badge, plus a prompt to install the engine to unlock the rungs that aggregates cannot support.
- Compatibility page as a normal marketing route with its own metadata, matching the existing mesh/hairline standard.
