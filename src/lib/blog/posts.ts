/**
 * The blog corpus.
 *
 * Articles live as structured blocks rather than raw HTML so every post renders
 * through the same Intelligence-page design language: hairline rails, oversized
 * typography, no cards except the single mid-article CTA banner.
 */

export type InternalPath =
  | "/models"
  | "/intelligence"
  | "/pricing"
  | "/legal/methodology"
  | "/reports/cheapest-api-calls"
  | "/standard";

export type Block =
  | { t: "p"; v: string }
  | { t: "h2"; v: string }
  | { t: "defs"; items: { term: string; text: string }[] }
  | { t: "cta"; headline: string; label: string; to: InternalPath };

export interface BlogPost {
  slug: string;
  title: string;
  /** Short deck shown on the index and under the H1. */
  deck: string;
  description: string;
  keyword: string;
  published: string;
  minutes: number;
  blocks: Block[];
  /** Optional replacement for the standard closing line. */
  closingLine?: string;
}

export const POSTS: BlogPost[] = [
  {
    slug: "finops-for-ai",
    title: "FinOps for AI: how it's different from cloud FinOps",
    deck: "AI is now its own FinOps category, not a cloud subcategory. What changed, and how to actually govern AI spend.",
    description:
      "FinOps for AI is now its own category, not a cloud FinOps subcategory. Here's what changed, why it matters, and how to actually govern AI spend.",
    keyword: "FinOps for AI",
    published: "2026-07-14",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "For most of the last decade, managing cloud costs meant applying FinOps: the practice of bringing engineering, finance, and business teams together to track spend, allocate cost, and optimize usage. It worked because cloud billing, while messy, was at least predictable. You provisioned a resource, you paid for the resource, and the unit economics held still long enough to build a forecast around them.",
      },
      {
        t: "p",
        v: "AI spend does not behave that way, and the industry has now formally acknowledged it. The FinOps Foundation added AI as its own distinct technology category in its 2026 Framework, separate from cloud, SaaS, and data center. That is not a branding exercise. It reflects a real, structural difference in how AI costs actually work.",
      },
      { t: "h2", v: "Why AI breaks the old FinOps model" },
      {
        t: "p",
        v: "Traditional cloud FinOps assumes provisioned resources with relatively stable billing units. A virtual machine costs roughly the same thing this month as it did last month. AI spend does not offer that comfort. A single AI initiative can touch GPU compute, a managed LLM API, proprietary model hosting, and a data pipeline, all billed through different mechanisms with no unified view connecting them. Layer on usage based token pricing, and the same feature can cost wildly different amounts month to month depending purely on how people used it, not on any deliberate provisioning decision.",
      },
      {
        t: "p",
        v: "The State of FinOps 2026 report found that 98 percent of FinOps teams now manage AI spend, up from just 31 percent two years earlier. That is one of the fastest category shifts the discipline has ever seen, and most teams are applying old tools to a new problem.",
      },
      { t: "h2", v: "The four things that make AI spend genuinely different" },
      {
        t: "defs",
        items: [
          {
            term: "Cost complexity across providers",
            text: "A workload might route through OpenAI, Anthropic, and a self hosted model in the same week, each with its own pricing structure and none of them visible in a single invoice.",
          },
          {
            term: "Faster development cycles",
            text: "Product and engineering teams ship AI features faster than most FinOps review cadences can keep up with, so cost decisions get made long before anyone with a governance mandate sees them.",
          },
          {
            term: "Spend unpredictability",
            text: "Token based billing means the same feature can cost twice as much simply because usage patterns shifted, with no provisioning change to explain it.",
          },
          {
            term: "Ownership gaps",
            text: "AI spend frequently starts inside a single team's experimentation budget and quietly becomes a company wide cost center before anyone formally owns it.",
          },
        ],
      },
      { t: "h2", v: "What actual AI Financial Governance looks like" },
      {
        t: "p",
        v: "The honest answer is that most organizations are not doing this well yet. Visibility is the first and hardest problem: you cannot govern spend you cannot see, and most tools built for cloud billing were never designed to parse token counts, model identifiers, or per request cost.",
      },
      {
        t: "p",
        v: "The practices that are starting to work share a common thread. They treat billed spend as ground truth, the actual dollar amount a provider charged, not an estimate built from multiplying tokens by a published price. They track spend by workload and by model, not just by provider. And critically, they never let a cost saving decision override a quality requirement without evidence: switching to a cheaper model is only a real saving if the output stays equivalent, and that has to be measured, not assumed.",
      },
      {
        t: "p",
        v: "This is the actual discipline of Financial Governance for AI: visibility first, attribution second, and any switching decision backed by proof rather than a hope that a cheaper model will hold up.",
      },
      {
        t: "cta",
        headline: "See what governed AI spend actually looks like",
        label: "See what the free level covers",
        to: "/pricing",
      },
      { t: "h2", v: "Where this goes next" },
      {
        t: "p",
        v: "As agentic AI scales, this problem gets harder before it gets easier. Autonomous agents make their own tool calls, which means spend decisions are increasingly being made by software, not by a human who might have thought twice about the bill. Any AI Financial Governance approach that only reviews cost after the fact will fall further behind every quarter that agents keep expanding their footprint.",
      },
      {
        t: "p",
        v: "The organizations building real discipline into this now, rather than treating it as a fire drill once finance asks a hard question, are the ones who will scale AI spend without losing control of it.",
      },
      {
        t: "cta",
        headline: "The four-rung framework this all builds toward, in one place",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
    ],
  },

  {
    slug: "shadow-ai-spend",
    title: "Shadow AI spend: the line item nobody's budgeting for",
    deck: "It hides in expense reports and personal subscriptions until an audit finds it. What it actually costs, and how visibility fixes it.",
    description:
      "Shadow AI spend hides in expense reports and personal subscriptions until an audit finds it. Here's what it actually costs and how visibility fixes it.",
    keyword: "shadow AI spend",
    published: "2026-07-16",
    minutes: 5,
    blocks: [
      {
        t: "p",
        v: "Every finance leader has had some version of the same experience: a routine audit turns up an AI subscription nobody remembers approving, then another, then a pattern. Shadow AI spend is what happens when employees adopt AI tools faster than procurement can track them, and it is far more common than most budgets assume.",
      },
      { t: "h2", v: "Why shadow AI spend hides so well" },
      {
        t: "p",
        v: "The reason shadow AI spend is chronically underestimated is that it usually arrives in a form too small to trigger scrutiny. A twenty or forty dollar monthly subscription on an individual expense report looks trivial. Multiply that across a few thousand employees, and it becomes a real, uncounted line item, one that sits below every approval threshold and therefore never reaches a single owner who could see the total.",
      },
      {
        t: "p",
        v: "Recent industry research puts real numbers behind the instinct. Only 31 percent of organizations report accurate visibility into their AI software spend, according to Flexera's 2026 State of ITAM Report. That means more than two out of three organizations are, by their own admission, managing AI budgets partly blind. Audits at large enterprises routinely surface hundreds of distinct unsanctioned AI tools and seven figure annual spend that had never been consolidated into a single view.",
      },
      { t: "h2", v: "It is not just a budget problem" },
      {
        t: "p",
        v: "Shadow AI spend carries a second cost that rarely shows up in the same conversation as the dollar figure: when sensitive company data flows through an AI tool that was never reviewed by security or legal, the organization has taken on risk it cannot quantify. A tool adopted for convenience by one team can become a compliance blind spot for the whole company, and that exposure compounds quietly until something forces it into view.",
      },
      { t: "h2", v: "Why banning shadow AI does not work" },
      {
        t: "p",
        v: "The instinctive response, a blanket ban on unapproved AI tools, tends to fail for a predictable reason. It does not stop the underlying demand, it just pushes it further out of sight, onto personal devices and personal accounts where IT has zero visibility at all. Employees who need AI to keep pace with their workload will find a way to use it. The organizations that manage this well are not the ones that ban hardest, they are the ones that make the approved path faster and easier to use than the unapproved one.",
      },
      { t: "h2", v: "What actual visibility requires" },
      {
        t: "p",
        v: "Closing the shadow AI spend gap starts with a real inventory: what tools are actually running, what data they touch, and who is paying for them. That inventory only stays accurate if it is connected to a live view of spend, not a quarterly survey that goes stale the moment a new tool gets adopted.",
      },
      {
        t: "p",
        v: "This is where the architecture of the tracking system matters as much as the intent behind it. A visibility tool that requires handing over provider credentials to a third party just relocates the trust problem instead of solving it. The more defensible approach reads usage and billing data directly from the customer's own environment, without ever taking custody of the underlying provider keys, so adoption does not require a new leap of faith to get the old problem of visibility solved.",
      },
      {
        t: "cta",
        headline: "Track every model and provider without handing over your keys",
        label: "See how the Verification Engine works",
        to: "/legal/methodology",
      },
      { t: "h2", v: "The path forward" },
      {
        t: "p",
        v: "Shadow AI spend will not shrink on its own, adoption is moving faster than governance almost everywhere. The organizations getting ahead of it are treating visibility as the first deliverable, not the last, and building a governed path that is genuinely easier to use than the shadow alternative it is meant to replace.",
      },
    ],
  },

  {
    slug: "ai-costs-rising-token-prices-falling",
    title: "Why your AI bill keeps rising even as token prices fall",
    deck: "Token prices have collapsed since 2023. Bills have not. The variable that actually drives your invoice is consumption.",
    description:
      "Token prices have fallen dramatically since 2023, yet AI bills keep climbing. Here's the real reason, and what it means for your budget.",
    keyword: "why AI costs are rising",
    published: "2026-07-18",
    minutes: 5,
    blocks: [
      {
        t: "p",
        v: "If your AI bill has gone up this year, you are not imagining it, and you are also not wrong that model pricing has been falling. Both things are true at once, and understanding why is the key to actually controlling AI spend rather than just watching it.",
      },
      { t: "h2", v: "The headline number everyone quotes" },
      {
        t: "p",
        v: "Per token pricing for frontier grade AI models has fallen dramatically since early 2023, by some measures roughly ninety percent or more for comparable capability. New model generations routinely launch cheaper than the ones they replace, and providers compete aggressively on price as open weight alternatives put pressure on every tier of the market. On paper, this should be the best possible news for anyone budgeting AI spend.",
      },
      { t: "h2", v: "The number that explains why bills are not falling anyway" },
      {
        t: "p",
        v: "Usage has grown even faster than price has fallen. Reporting drawing on real enterprise and developer token volume found business token consumption growing roughly ten times faster than token spend over a recent twelve month period, meaning the industry is using vastly more tokens per dollar than before, and still spending more overall dollars than before. The math only resolves one way: consumption is the variable actually driving the bill, not price.",
      },
      { t: "h2", v: "Agentic workloads are the accelerant" },
      {
        t: "p",
        v: "The single biggest reason consumption has exploded is the shift from simple chatbot style requests to agentic workflows. An agent that plans, calls tools, checks its own work, and iterates can consume ten to thirty times more tokens per completed task than a single chat completion, because every one of those internal steps is itself a model call that gets billed. A cheaper price per token does very little to offset a workload that is quietly generating thirty times as many tokens to do the same job.",
      },
      {
        t: "p",
        v: "This is not a hypothetical. Public reporting has documented enterprise engineering teams exhausting an entire year's AI coding budget in a matter of months once agentic coding tools became the default way of working, purely on volume, with per engineer costs running well into four figures a month.",
      },
      {
        t: "cta",
        headline: "See real, live price moves across every model you use",
        label: "View the Intelligence page",
        to: "/intelligence",
      },
      { t: "h2", v: "Why this matters for how you budget" },
      {
        t: "p",
        v: "The practical implication is that tracking price alone tells you almost nothing useful about where your budget is going. A team that only watches published per token rates will be blindsided by a bill that keeps climbing even as every rate card they can find keeps getting cheaper. The number that actually predicts your bill is consumption, broken down by workload, by model, and ideally by the specific feature or team driving it.",
      },
      { t: "h2", v: "What to actually do about it" },
      {
        t: "p",
        v: "The lever that works is not negotiating a better rate, it is understanding which workloads are consuming disproportionately and whether they need to. Some tasks genuinely require a frontier model's reasoning depth. A large share of production traffic, classification, extraction, routing, simple summarization, does not, and running it on an oversized model is a cost decision nobody made deliberately, it just accumulated.",
      },
      {
        t: "p",
        v: "Seeing this requires a live, accurate view of actual spend by model and by host, not a monthly invoice summary and not a token count multiplied by a list price that may not reflect volume discounts, caching, or batch processing already in effect. The organizations getting ahead of rising bills are the ones treating consumption visibility as a first class metric, not an afterthought to the price they thought they negotiated.",
      },
    ],
  },

  {
    slug: "ai-vendor-lock-in-multi-model-strategy",
    title: "AI vendor lock-in: a multi-model strategy without rewriting your stack",
    deck: "Betting the whole stack on one provider is a real risk, not a hypothetical one. Build the option to switch before you need it.",
    description:
      "Betting your entire AI stack on one provider is a real risk, not a hypothetical one. Here's how to build a multi-model strategy without a rebuild.",
    keyword: "AI vendor lock-in",
    published: "2026-07-21",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "AI vendor lock-in is the dependency an organization creates when its workflows, prompts, and integrations are built tightly around a single AI provider or model. It sounds like an abstract architecture concern until the day that provider changes its pricing, restricts a model, or has an outage, and the organization discovers it has no practical way to route around any of it.",
      },
      { t: "h2", v: "Why this risk is growing, not shrinking" },
      {
        t: "p",
        v: "Analysts have been direct about this. Enterprises are advised not to be afraid of a multi-vendor approach specifically to avoid getting locked into a single AI ecosystem, because it is unlikely any one vendor or model will meet every requirement indefinitely. The risk is not theoretical: model providers have cut prices, changed rate limits, and experienced real outages, and organizations built entirely around one provider had no fallback while any of that was happening, and no leverage over the pricing that followed.",
      },
      { t: "h2", v: "The three things actually at risk" },
      {
        t: "defs",
        items: [
          {
            term: "Continuity",
            text: "If a single vendor becomes unavailable, whether from an outage, a policy change, or a business decision on their side, every workflow built on that vendor stops at once, not gradually.",
          },
          {
            term: "Cost control",
            text: "A single vendor relationship removes your ability to compare, negotiate, or simply route traffic to a cheaper equivalent option when prices shift.",
          },
          {
            term: "Governance credibility",
            text: "It is difficult to tell a board or an auditor that AI spend and AI risk are actively managed when the entire stack depends on one external company's roadmap and pricing decisions.",
          },
        ],
      },
      { t: "h2", v: "The mistakes that create lock-in without anyone deciding to" },
      {
        t: "p",
        v: "Lock-in rarely happens as a deliberate choice. It accumulates through small decisions: hard coding a specific model name directly into application code, tuning prompts so precisely to one model's behavior that they do not transfer cleanly to another, and building agent orchestration logic so tightly coupled to one vendor's framework that moving it is a development project rather than a configuration change.",
      },
      { t: "h2", v: "What an actual multi-model strategy requires" },
      {
        t: "p",
        v: "The fix is not switching vendors, it is building the option to switch without it being expensive to exercise. That starts with an abstraction layer between your application code and the model provider, so your code talks to a stable interface rather than to each vendor's API directly. Analysis of real multi-cloud AI deployments found that organizations who built this abstraction into their first deployment were able to add or switch providers with sixty to eighty percent less migration effort than those who built directly against a single vendor's API and had to retrofit flexibility later.",
      },
      {
        t: "p",
        v: "The second requirement is proof, not assumption, that an alternative model actually performs equivalently for your specific workload before you route any real traffic to it. A cheaper or more available alternative is only a genuine option if you can show, not guess, that switching does not quietly degrade output quality.",
      },
      {
        t: "cta",
        headline: "Certified switches, backed by proof, not guesswork",
        label: "Read the certification method",
        to: "/legal/methodology",
      },
      { t: "h2", v: "Where to start" },
      {
        t: "p",
        v: "You do not need to duplicate every deployment across every provider to get the benefit of this. Identify which workloads are business critical enough to justify a genuine secondary provider option, and which can reasonably stay on a single provider with acceptable risk. Build the abstraction and the measurement discipline around the workloads that matter first, and expand from there.",
      },
      {
        t: "p",
        v: "The organizations that treat multi-model flexibility as infrastructure, built in from the start, spend far less time and money regaining that flexibility later than the ones who wait until a vendor problem forces the question.",
      },
    ],
  },

  {
    slug: "llm-token-pricing-explained",
    title: "LLM token pricing explained: how model costs actually work",
    deck: "A rate card tells you less than it looks like it does. Caching, batching and reasoning tokens decide the real bill.",
    description:
      "Token pricing looks simple on a rate card and gets complicated fast in production. Here's what actually determines your real AI bill.",
    keyword: "LLM token pricing explained",
    published: "2026-07-23",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "Every AI provider publishes a pricing page listing a dollar amount per million tokens, and every one of those pages tells you less than it looks like it does. Understanding what actually drives your bill requires going one level deeper than the rate card.",
      },
      { t: "h2", v: "What a token actually is" },
      {
        t: "p",
        v: "A token is roughly a chunk of text, sometimes a whole word, sometimes part of one, that a model processes as a unit. Pricing is quoted per million tokens because the numbers involved are large enough that per token pricing would be an awkward unit to reason about. The important detail most people miss at first: input tokens, the text you send the model, and output tokens, the text it generates back, are priced separately and almost always at different rates, with output tokens typically costing several times more than input tokens for the same model.",
      },
      { t: "h2", v: "Why the sticker price is only part of the real cost" },
      {
        t: "defs",
        items: [
          {
            term: "Prompt caching",
            text: "When consecutive requests share a stable prefix, such as a system prompt or a retrieved document that does not change between calls, providers let you skip reprocessing it. Cached input tokens can cost a small fraction of the standard rate, and providers vary meaningfully in how aggressive that discount is.",
          },
          {
            term: "Batch processing",
            text: "Nearly every major provider offers a batch endpoint priced well below the live, real time rate in exchange for an asynchronous response window. Anything that does not need a sub second answer, evaluation runs, enrichment jobs, classification at scale, is a candidate for this discount and many teams never turn it on.",
          },
          {
            term: "Reasoning tokens",
            text: "Models that think step by step before answering generate internal reasoning tokens that are billed as output, even though the user never sees them. This makes the effective cost per useful, visible answer meaningfully higher than the headline output rate suggests for reasoning heavy models.",
          },
        ],
      },
      { t: "h2", v: "Why comparing sticker prices across providers is misleading" },
      {
        t: "p",
        v: "A model that looks twice as expensive per million tokens on paper can end up cheaper in practice once caching, batching, and actual task performance are accounted for, because a weaker but cheaper model might need multiple retries or a longer prompt to do the same job as a stronger one in a single pass. Comparing AI model costs on rate card price alone, without accounting for how many tokens a given task actually requires on each model, routinely produces the wrong answer.",
      },
      {
        t: "cta",
        headline: "Browse live, current pricing across every model and host",
        label: "Browse the Models catalog",
        to: "/models",
      },
      { t: "h2", v: "What actually determines your bill" },
      {
        t: "p",
        v: "Your real monthly cost is a function of four things multiplied together: the rate per token, the number of tokens per request, the number of requests, and which discount mechanisms you have actually enabled. Most organizations can name the first variable easily and have almost no visibility into the other three, which is why the invoice so often surprises them.",
      },
      { t: "h2", v: "Where to look instead of a static price table" },
      {
        t: "p",
        v: "Published rate cards go stale the moment a provider adjusts pricing, and most providers now adjust pricing more often than once a quarter. A living view of current pricing across every provider and host you actually use, updated as prices change rather than on a fixed publishing schedule, is the only reliable way to know what a switch would actually save you today, not what it would have saved you last quarter.",
      },
    ],
  },

  {
    slug: "cut-ai-api-costs-without-losing-quality",
    title: "How to cut AI API costs without sacrificing quality",
    deck: "Routing, caching and right-sizing cut spend by more than half. The step almost everyone skips is proving quality held.",
    description:
      "Routing, caching, and right-sizing can cut AI spend by more than half. The part almost everyone skips is proving quality did not drop with it.",
    keyword: "cut AI API costs without losing quality",
    published: "2026-07-25",
    minutes: 6,
    closingLine: "Stop guessing which switch is safe.",
    blocks: [
      {
        t: "p",
        v: "Every guide to cutting AI costs eventually arrives at the same three levers: send requests to a cheaper model where possible, cache what you can, and stop running simple tasks on expensive models out of habit. All three genuinely work. The part that separates a real saving from a quiet quality regression is proof, and that is the step most guides treat as an afterthought.",
      },
      { t: "h2", v: "The three levers that actually move the needle" },
      {
        t: "defs",
        items: [
          {
            term: "Model routing",
            text: "Not every request needs your most capable, most expensive model. Splitting traffic so that routine, high volume tasks, classification, extraction, simple summarization, run on a smaller, cheaper model while only the genuinely hard cases escalate to a frontier model is consistently the single largest lever available, with real deployments reporting cost reductions in the range of thirty to eighty five percent on the routed traffic.",
          },
          {
            term: "Caching",
            text: "Prompt caching for repeated context, and semantic caching for queries that are worded differently but mean the same thing, both reduce the number of tokens you pay to reprocess. One documented case cut a forty seven thousand dollar monthly bill to under thirteen thousand dollars after adopting semantic caching, moving the cache hit rate from eighteen percent to sixty seven percent.",
          },
          {
            term: "Right sizing",
            text: "A large share of production AI traffic runs on a model more capable, and more expensive, than the task actually requires, simply because that is the model the team started with. Identifying which workloads are genuinely overpowered for their task is often the easiest saving to find and the one most teams have never audited.",
          },
        ],
      },
      { t: "h2", v: "The line that appears in almost every article on this topic" },
      {
        t: "p",
        v: "Nearly every guide to cutting AI costs includes some version of the same warning: cheaper is only a real saving if quality holds. Anyone can cut a bill in half by switching to a worse model. The hard part, and the part that actually matters, is keeping output quality flat while the bill drops.",
      },
      { t: "h2", v: "Why that warning usually stays a warning" },
      {
        t: "p",
        v: "The trouble is that most of the same articles stop right there, at the caveat, without describing what verifying quality actually looks like in practice. \"Test it on your own data first\" is true and also not a process. Doing this properly requires an independent, published benchmark for the specific type of task in question, not a general leaderboard score, a measured sense of how much uncertainty that benchmark carries, and a defined tolerance band for what counts as equivalent rather than merely close.",
      },
      { t: "h2", v: "What proof actually requires" },
      {
        t: "p",
        v: "A switch should only be considered safe when a candidate model's measured score sits inside a real equivalence band around your current model's score for that specific task type, not simply when it is cheaper. That band has to account for the benchmark's own measurement margin, since every evaluation carries real uncertainty and treating a noisy few point difference as a meaningful quality gap, or ignoring a real one, are both mistakes.",
      },
      {
        t: "p",
        v: "Just as important is what happens when nothing clears that bar. A responsible system says so, with the specific reason, rather than quietly suggesting a weaker option anyway. A downgrade that looks like a saving on the invoice and costs more in support tickets, rework, or lost trust was never a saving at all.",
      },
      {
        t: "cta",
        headline: "Every switch we suggest is certified first",
        label: "Read the certification method",
        to: "/legal/methodology",
      },
      { t: "h2", v: "The actual playbook" },
      {
        t: "p",
        v: "Route the routine work to cheaper models. Cache aggressively. Audit for oversized models running undersized tasks. And before any of those switches goes live, require the same kind of evidence you would want from a vendor claiming their model is just as good, not vendor marketing, not a spot check, a real measured comparison against a real independent benchmark for that exact task.",
      },
    ],
  },

  {
    slug: "real-cost-of-ai-agents",
    title: "The real cost of AI agents: why agentic workloads blow up budgets",
    deck: "An agent can burn thirty times the tokens of a single chat call. That is a governance question, not an engineering footnote.",
    description:
      "Agentic AI workloads can consume 30 times more tokens than a simple chat request. Here's why agent budgets blow up, and how to keep control of them.",
    keyword: "cost of AI agents",
    published: "2026-07-28",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "An AI agent that plans a task, calls tools, checks its own output, and iterates until it gets a task right is doing something genuinely useful, and every one of those internal steps is a separate model call that gets billed. That is the part of agentic AI's cost story that budgets consistently miss until the invoice arrives.",
      },
      { t: "h2", v: "The number that explains most agent budget surprises" },
      {
        t: "p",
        v: "Agentic workflows can consume roughly ten to thirty times more tokens per completed task than a single chatbot style request, because the visible answer a user sees is often the last step in a chain of internal planning, tool calls, and self correction that all happened first. A per token price that looks perfectly reasonable on a rate card can still produce an enormous bill once a task that used to be one model call becomes twenty.",
      },
      { t: "h2", v: "This is not a hypothetical risk" },
      {
        t: "p",
        v: "Public reporting has documented real organizations running into this at scale. One major technology company exhausted its entire year's AI coding budget in about four months once agentic coding tools became the default way engineers worked, with per engineer costs running well into four figures a month. Another canceled internal licenses for an agentic coding tool specifically because token bills had become unsustainable at the scale the organization was using it. These are not edge cases, they are the visible tip of a pattern playing out across many organizations that adopted agentic tools faster than they built the cost visibility to match.",
      },
      { t: "h2", v: "Why agent costs are harder to govern than ordinary AI spend" },
      {
        t: "p",
        v: "Ordinary chatbot usage has a rough, predictable shape: one request in, one response out, a cost that scales fairly linearly with how many people are using it. Agent costs do not behave that way. The same task can cost dramatically different amounts depending on how many steps the agent needed, how much it needed to retry, and how much context it accumulated along the way, none of which is visible from the outside until the bill reflects it.",
      },
      {
        t: "p",
        v: "This unpredictability is exactly why usage based and hybrid pricing models have become the norm for agent products themselves: a pure per action price creates bill shock for the buyer, so most agent products now layer a predictable base fee with usage limits on top, which shifts the underlying volatility onto the vendor rather than solving it.",
      },
      { t: "h2", v: "Why this is a governance problem, not just an engineering one" },
      {
        t: "p",
        v: "The organizations getting this right are not treating agent cost control as an engineering side project. It is a Financial Governance question: who owns the decision to let an agent operate autonomously versus requiring a human to approve high cost actions, what the actual dollar ceiling is before an agent's spend gets flagged, and whether the organization can even see, in real time, which agents are consuming the most.",
      },
      { t: "h2", v: "What actual agent cost governance looks like" },
      {
        t: "p",
        v: "Visibility has to exist at the workload level, not just the aggregate monthly bill, because a single overactive agent workflow can be responsible for a disproportionate share of total spend without anyone noticing until it is large. Beyond visibility, the systems managing agent spend need real guardrails: a minimum materiality threshold before an autonomous action is even considered, a cooldown between changes so a misbehaving agent cannot thrash, and a hard requirement that any switch an agent makes autonomously is provably safe, not just cheaper, before it is applied without a human in the loop.",
      },
      {
        t: "cta",
        headline: "See exactly what your agents would do unattended, before you turn autonomy on",
        label: "See what each level does",
        to: "/pricing",
      },
      {
        t: "p",
        v: "Agent adoption is not slowing down, and the budget risk it creates will not either, until organizations treat autonomous spend with the same rigor they would apply to any other autonomous financial decision.",
      },
    ],
  },

  {
    slug: "ai-cost-governance-101",
    title: "AI cost governance 101: building visibility before finance asks",
    deck: "Almost everyone tracks AI spend. Almost nobody can forecast it. That gap is where every budget surprise lives.",
    description:
      "Most companies track AI spend and still can't forecast it. Here's what real AI cost governance actually requires, before finance asks the hard question.",
    keyword: "AI cost governance",
    published: "2026-07-30",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "There is a specific, uncomfortable gap showing up across enterprise AI budgets right now: organizations are tracking AI infrastructure costs almost universally, and assigning formal budgets to it almost as often, and still failing to forecast that spend with any real accuracy. Tracking a number and being able to predict it are not the same skill, and most companies have only built the first one.",
      },
      { t: "h2", v: "The gap, in one statistic" },
      {
        t: "p",
        v: "A 2026 survey of nearly four hundred organizations found that 98 percent track AI infrastructure costs and 95 percent assign formal AI budgets, yet only 11 percent can forecast AI spend within ten percent of the actual outcome. That gap between tracking and forecasting is where most AI budget surprises live, and 62 percent of organizations in the same survey reported that an unexpected AI cost had altered a real business decision in the past year.",
      },
      { t: "h2", v: "Why tracking does not equal governance" },
      {
        t: "p",
        v: "Tracking spend after the fact tells you what happened last month. Governance means you can predict what will happen next month with enough confidence to make a decision today. The reason so few organizations have closed that gap is that AI spend does not behave like the budget categories finance teams are used to forecasting. A per seat software license renews at a known price on a known date. Token based AI spend moves with usage, and usage moves with product decisions, marketing campaigns, and now, increasingly, with how many autonomous agents happen to be running that week.",
      },
      { t: "h2", v: "The four pillars of AI cost governance that actually work" },
      {
        t: "defs",
        items: [
          {
            term: "Real, not estimated, spend",
            text: "The number that matters is what a provider actually billed, not tokens multiplied by a published rate. Committed use discounts, volume pricing, and caching all mean the estimate and the real bill routinely diverge, sometimes significantly.",
          },
          {
            term: "Attribution by workload",
            text: "A single company wide AI spend number is not actionable. Knowing which team, which feature, and which model is driving cost is what turns a number into a decision.",
          },
          {
            term: "Forecasting grounded in actual usage",
            text: "Simple month over month averages break the moment a workload's usage pattern shifts, which happens constantly with AI features still in active development. Real forecasting has to account for trend, for weekly or seasonal usage patterns, and for the possibility that a workload simply stops or starts.",
          },
          {
            term: "Switching decisions backed by evidence",
            text: "When a cheaper option becomes available, whether a price drop or a new model, the decision to switch has to be provable, not just plausible, or the saving on paper turns into a quality problem in production.",
          },
        ],
      },
      {
        t: "cta",
        headline: "Real billed spend, never estimated",
        label: "Read how we measure spend",
        to: "/legal/methodology",
      },
      { t: "h2", v: "Where to start if you are behind" },
      {
        t: "p",
        v: "Start with visibility before anything else. You cannot forecast, attribute, or govern spend you cannot see accurately, and most organizations discover during this step that a meaningful share of their AI spend was not where they thought it was. From there, attribution and forecasting become tractable problems rather than guesses, and the switching decisions that follow can be made on evidence instead of hope.",
      },
      {
        t: "p",
        v: "The organizations closing the gap between tracking and forecasting are not doing anything exotic. They are simply refusing to accept an estimate where a real number is available, and refusing to make a cost saving decision without proof that it will not cost more somewhere else.",
      },
      {
        t: "cta",
        headline: "Visibility is rung one of a four-rung standard",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
    ],
  },

  {
    slug: "benchmark-backed-model-switching",
    title: "Benchmark-backed model switching: why cheaper isn't automatically safe",
    deck: "A cheaper model is only a saving if it performs equivalently. Here is what proving that actually takes.",
    description:
      "A cheaper model is only a real saving if it performs equivalently. Here's what it actually takes to prove that, and why most switching advice skips this part.",
    keyword: "benchmark-backed model switching",
    published: "2026-08-01",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "\"Cheaper but worse\" is not a saving, it is a quality problem wearing a saving's clothes. Every guide to reducing AI costs eventually says some version of this. Almost none of them explain what proving equivalence actually requires, which is the entire reason so many teams end up making a switch on instinct and finding out later that it was the wrong call.",
      },
      { t: "h2", v: "Why a leaderboard score is not enough" },
      {
        t: "p",
        v: "The obvious first move when comparing two models is to check a public benchmark leaderboard and see which one scores higher. This is a reasonable starting point and a genuinely incomplete answer, for two reasons. First, a general purpose benchmark score often does not reflect performance on your specific task type; a model that scores well on broad reasoning benchmarks can still underperform on, say, structured classification or code generation specifically. Second, and less appreciated, every benchmark score carries real measurement uncertainty. Two models scoring within a few points of each other on a leaderboard may not be meaningfully different at all, or they might be, and a leaderboard alone cannot tell you which.",
      },
      { t: "h2", v: "What an equivalence band actually is" },
      {
        t: "p",
        v: "A more rigorous approach starts from the model you are already running, takes its measured score on an independent, task specific benchmark, and defines a band around that score representing real measurement uncertainty rather than an arbitrary cutoff. A candidate model only qualifies as a genuine switch if its own measured score falls inside that band. A cheaper model that scores meaningfully below the band is not a safe switch, no matter how large the price difference looks, because the saving on the invoice would be paid for in output quality somewhere downstream.",
      },
      {
        t: "p",
        v: "This margin is not a nice to have detail, it is the entire point. Treating a small, statistically meaningless score difference as if it were a real quality gap blocks switches that were actually safe. Ignoring a real gap because the price difference is tempting creates exactly the quiet quality regression the whole exercise was supposed to prevent.",
      },
      { t: "h2", v: "When a benchmark stops being useful at all" },
      {
        t: "p",
        v: "There is a subtler failure mode worth understanding: a benchmark can become saturated, meaning too many models now score so close together that the benchmark can no longer reliably tell them apart at all. When the spread between models' scores collapses down toward the size of the measurement margin itself, the instrument has stopped discriminating, and continuing to use it to justify switches is closer to guessing than measuring. The honest response when this happens is to say so and stop relying on that particular benchmark for that task, not to keep citing a number that has quietly stopped meaning anything.",
      },
      {
        t: "cta",
        headline: "We refuse switches we can't prove, and tell you why",
        label: "Read when we refuse a switch",
        to: "/legal/methodology",
      },
      { t: "h2", v: "What a real refusal looks like" },
      {
        t: "p",
        v: "The other half of doing this properly is being willing to say no. If a candidate model's score falls outside the equivalence band, or if no independent benchmark exists yet for the task type in question, the honest answer is that the switch cannot be recommended, with the specific reason stated plainly rather than glossed over. A system that only ever tells you about the switches that clear, and stays silent about everything that got evaluated and rejected, is not more trustworthy for showing you fewer numbers, it is less trustworthy for hiding the ones it could not defend.",
      },
      { t: "h2", v: "The standard to hold any switching decision to" },
      {
        t: "p",
        v: "Before treating any model swap as a real saving, ask three questions. Is the comparison based on an independent, task specific benchmark, not a general leaderboard score. Does the comparison account for the benchmark's own measurement uncertainty, not just the headline number. And if the candidate does not clear that bar, does the process say so honestly, or does it quietly suggest the cheaper option anyway. A switch that cannot answer all three was never actually proven safe, it was just cheaper.",
      },
      {
        t: "cta",
        headline: "Rung two of the standard, defined formally",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
    ],
  },

  {
    slug: "ai-spend-forecasting",
    title: "AI spend forecasting: why most companies can't predict their own bill",
    deck: "Only eleven percent forecast AI spend within ten percent. Averages break on AI, and here is what replaces them.",
    description:
      "Only a small fraction of companies can forecast AI spend within ten percent. Here's why traditional budgeting breaks on AI, and what actually predicts it.",
    keyword: "AI spend forecasting",
    published: "2026-08-01",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "Forecasting AI spend has quietly become one of the hardest budgeting problems most finance teams have ever faced, and the data backs up the frustration. In a 2026 survey of enterprise organizations, only eleven percent could forecast their AI spend within ten percent of the actual outcome, despite the overwhelming majority already tracking costs and assigning formal budgets to them.",
      },
      { t: "h2", v: "Why the old budgeting playbook does not transfer" },
      {
        t: "p",
        v: "Traditional software budgeting works because the underlying cost structure is stable. A seat license renews at a known price. A provisioned server costs roughly the same this month as last month. AI spend broke that assumption the moment usage based, token priced billing became the norm. The same feature, with the exact same code, can cost meaningfully more or less from one month to the next purely because usage patterns shifted, with no provisioning decision behind the change at all.",
      },
      {
        t: "p",
        v: "Many organizations also started their AI adoption under flat rate subscriptions or bundled enterprise agreements, where the bill was predictable by design and nobody watched it closely as a result. When those agreements ended and usage based pricing took over, the cost model changed completely, and the visibility needed to catch that shift early simply was not built yet.",
      },
      { t: "h2", v: "Why simple averages fail" },
      {
        t: "p",
        v: "The most common forecasting method, taking a trailing average and projecting it forward, breaks in AI spend specifically because usage is rarely stable enough for an average to mean much. Weekly patterns matter: many workloads show a real difference between weekday and weekend traffic that a flat average smooths away and gets wrong in both directions depending on which day of the month you happen to be forecasting from. Trend matters, because usage of a growing AI feature accelerates in a way a simple average always underestimates. And structural breaks matter most of all: when a workload that used to run steadily suddenly stops, or a brand new workload appears from nowhere, any forecast built on historical averages will confidently produce the wrong number right at the moment accuracy matters most.",
      },
      { t: "h2", v: "What an honest forecast actually requires" },
      {
        t: "p",
        v: "A forecast that can survive contact with real AI usage needs to combine several things at once: the actual month to date spend as a real, hard floor, a trailing rate that reflects recent behavior rather than the whole quarter, an adjustment for known weekly or seasonal patterns, and a way of detecting when a workload has structurally changed rather than just fluctuated. When that structural break happens, the honest move is to widen the forecast into a real range and say so, rather than presenting a single confident number that is built on an assumption that no longer holds.",
      },
      {
        t: "cta",
        headline: "See your projected month-end spend, built from real usage patterns",
        label: "See this month's market data",
        to: "/intelligence",
      },
      { t: "h2", v: "Why this discipline pays off" },
      {
        t: "p",
        v: "An organization that can forecast AI spend within a tight margin gets something more valuable than a tidier spreadsheet: it gets to make decisions before the bill arrives instead of reacting to it afterward. It can catch a workload that is about to become disproportionately expensive while there is still time to act, rather than discovering it a month later in a finance review. And it can tell the difference between a real, structural cost increase that needs a decision and ordinary week to week noise that does not.",
      },
      { t: "h2", v: "Where most organizations should start" },
      {
        t: "p",
        v: "Closing the eleven percent gap does not require a more sophisticated spreadsheet, it requires real, granular, workload level spend data feeding the forecast, and a method built specifically for the kind of volatility AI spend actually produces rather than one borrowed from a budgeting category that never had to deal with it. The organizations getting this right treat forecast accuracy as a real, measurable discipline, not an annual exercise in hope.",
      },
    ],
  },

  {
    slug: "ai-cost-governance-framework",
    title: "The AI cost governance framework: a guide for engineering teams",
    deck: "Four rungs that take a team from manual spend tracking to autonomous governance, and what has to be true before you climb each one.",
    description:
      "A practical AI cost governance framework for engineering teams: the four rungs from manual AI cost management to autonomous switching, and the evidence each one needs.",
    keyword: "AI cost governance framework",
    published: "2026-08-03",
    minutes: 7,
    blocks: [
      {
        t: "p",
        v: "Most engineering teams arrive at AI cost management the same way. Someone forwards the invoice, the number is larger than expected, and a spreadsheet appears. For a while the spreadsheet works. It stops working the moment a second model, a second host, or a second team enters the picture, because manual tracking measures what already happened and can never act on it. A cost governance framework is what replaces the spreadsheet: a defined ladder where each rung adds one capability and each capability is earned by evidence rather than assumed.",
      },
      {
        t: "p",
        v: "This is the framework we build against, and the reason it is written as rungs rather than a feature list is that the order genuinely matters. A team that automates switching before it can prove equivalence has not governed its AI spend, it has delegated it to software and hoped for the best.",
      },
      { t: "h2", v: "The four rungs" },
      {
        t: "defs",
        items: [
          {
            term: "Rung one: visibility and identical-model arbitrage",
            text: "Before anything else, you need to see spend by model, by host, and by workload, and to know that the same model is frequently cheaper somewhere else. The switch here changes nothing about your output, because it is the identical model on a different host. No quality argument is required, which is why this rung is free and why it is the correct first move for every team.",
          },
          {
            term: "Rung two: certified equal-quality substitution",
            text: "The next saving comes from changing the model itself, which is only defensible with benchmark evidence that the replacement clears the same quality bar on the kind of task you actually run. The rule is cheapest model that clears the bar, not highest scoring model available, and the measurement margin has to be real rather than assumed.",
          },
          {
            term: "Rung three: rightsizing and manual switching",
            text: "Most teams are running a frontier model on work a smaller model handles indistinguishably. Rightsizing detects that oversizing from observed token shapes and task complexity, then puts a human in the loop to approve each change. This is where governance becomes a decision rather than a report.",
          },
          {
            term: "Rung four: autonomous governance",
            text: "Only once the first three rungs are producing proven, reversible switches does it make sense to let the system act on its own inside limits you set. Autonomy is the last rung precisely because it is the one that requires the most trust, and trust here is accumulated evidence, not a setting.",
          },
        ],
      },
      { t: "h2", v: "Why the order cannot be shuffled" },
      {
        t: "p",
        v: "Every rung depends on the one beneath it. Equal-quality substitution is meaningless without the visibility to know which workload you are substituting. Rightsizing needs enough observed usage to distinguish a genuinely complex task from a simple one that happens to be running on an expensive model. Autonomous switching needs a track record of manual switches that held up, plus a rollback path that returns a workload to its previous model without ceremony. Teams that skip to the end tend to discover the gap during an incident, which is the most expensive possible moment to learn it.",
      },
      { t: "h2", v: "What each rung has to prove" },
      {
        t: "p",
        v: "A cost governance framework earns its name through what it refuses to do on thin evidence. Identical-model arbitrage proves the model key and the price, and nothing else needs proving. Equal-quality substitution proves a benchmark score on the relevant task class, with the measurement margin computed rather than borrowed. Rightsizing proves the observed token and complexity profile that made the model oversized in the first place. Autonomous switching proves all three, plus a recorded event trail showing who or what activated each change and when.",
      },
      {
        t: "p",
        v: "The corollary is the more important half of the framework: when the evidence is not there, the correct behaviour is to refuse rather than to estimate. A recommendation nobody can audit is not a saving, it is a liability with a dollar sign in front of it.",
      },
      {
        t: "cta",
        headline: "See which rung your AI spend is actually on",
        label: "See what the free level covers",
        to: "/pricing",
      },
      { t: "h2", v: "How to apply this in your own organisation" },
      {
        t: "p",
        v: "Start by answering one question honestly: can you attribute last month's AI bill to individual workloads and models without opening a provider console? If the answer is no, you are below rung one and no amount of optimisation strategy will help until that is fixed. If the answer is yes, the next question is whether any model change you have made in the last quarter was backed by a benchmark rather than an opinion. That answer usually locates a team precisely on the ladder.",
      },
      {
        t: "p",
        v: "From there the work is unglamorous and effective. Instrument spend at the request level so attribution is a query rather than an archaeology project. Reconcile estimated cost against the invoice the provider actually issued, so the numbers you govern with are the numbers finance sees. Move the easy identical-model switches first, because they cost nothing in quality risk and they buy political capital for the harder changes. Then, and only then, start moving models.",
      },
      { t: "h2", v: "Where governance stops being a report" },
      {
        t: "p",
        v: "The end state of an AI cost governance framework is not a dashboard anyone has to remember to open. It is a system that watches prices and benchmarks continuously, proposes changes with the evidence attached, executes the ones you have authorised, and reverses anything that stops holding up. Manual spend tracking asks a human to notice. Governance removes the requirement to notice, without removing the requirement to be able to explain every change after the fact.",
      },
      {
        t: "p",
        v: "That is the whole difference between AI cost management as an activity and AI cost governance as a discipline. One tells you what the bill was. The other decides, on evidence, what the bill should be.",
      },
      {
        t: "cta",
        headline: "The canonical, versioned statement of this framework",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
    ],
  },
  {
    slug: "why-ai-cost-optimisation-expires",
    title: "Why AI cost optimisation expires",
    deck: "Connect, optimise, done assumes the world holds still afterwards. It moves on three independent fronts, and only one of them is widely watched.",
    description:
      "AI cost optimisation has a shelf life. Prices move monthly, workloads mature, and an unchanged model ID can bill differently. What is proven, and what is not.",
    keyword: "AI cost optimisation",
    published: "2026-08-07",
    minutes: 8,
    blocks: [
      {
        t: "p",
        v: "The standard AI cost engagement has a clean shape: connect to the providers, analyse a few months of spend, recommend a set of changes, leave. It is an honest shape, and for a market that holds still it is the right one. Nobody pays a consultant to keep re-checking a number that cannot move.",
      },
      {
        t: "p",
        v: "So the only question that matters is whether this market holds still. It does not, and it fails to in three separate ways that have nothing to do with each other. Any one of them can raise your bill while the other two do nothing at all.",
      },
      { t: "h2", v: "Front one: the market re-prices itself every few weeks" },
      {
        t: "p",
        v: "Model pricing does not drift, it responds. A cheaper competitor arrives and the incumbent cuts. A flagship is quietly replaced by a stronger model at the same list price, which is a price cut expressed as capability rather than dollars. A provider that was the cheapest host for a given set of weights loses that position to another host running the identical model.",
      },
      {
        t: "p",
        v: "This is the front we can prove without qualification, because we keep an append-only ledger of every price move we have ever observed, with its date and its magnitude. Nothing in it can be edited after the fact. It is also the front with the sharpest implication for a one-time audit: the recommendations were not wrong. They were right on the day they were written, and the ranking they were derived from is regenerated by the market on a cadence the audit has no way to follow.",
      },
      {
        t: "p",
        v: "The practical version of this is unglamorous. A switch that saved twenty percent in March can be the more expensive option by June, not because anyone made a mistake, but because the alternative moved. Reversing a decision that has stopped paying requires knowing that it stopped, and that requires someone still looking.",
      },
      { t: "h2", v: "Front two: your own stack grows into a bigger bill" },
      {
        t: "p",
        v: "The second front comes from inside the building. As a team's use of AI matures, the work it asks of a model gets heavier. Prompts accumulate context. Retrieval starts pulling more documents. A single-shot call becomes an agent that makes four tool calls before it answers. None of this is a spending decision in the sense that anyone approves it, and none of it involves the provider changing anything, but spend per task rises anyway.",
      },
      {
        t: "p",
        v: "We are going to be explicit about the evidence here, because it is the weakest of the three. We have not measured this across our own customer base. Our production history is not yet long enough to separate a workload that got harder from a workload that simply got busier, and a chart that cannot tell those apart is not evidence of anything. Treat this front as reasonable and widely reported, not as something we have demonstrated.",
      },
      {
        t: "cta",
        headline: "The market half of this argument is published, dated, and free to read",
        label: "Open Intelligence",
        to: "/intelligence",
      },
      { t: "h2", v: "Front three: the setup you never touched changes underneath you" },
      {
        t: "p",
        v: "The third front is the one almost nobody monitors, because from the outside nothing happened. Same model identifier. Same prompt. Same code path. Same output, near enough that no test fails. And a different bill.",
      },
      {
        t: "p",
        v: "There are at least three mechanisms behind that. A provider can update the weights behind a stable model id. A reasoning model's default thinking effort can shift, so it thinks harder about the same question than it did last quarter. The scaffolding between your request and the model, the system layer you do not control and cannot see, can change how a request is assembled.",
      },
      {
        t: "p",
        v: "The reason this is invisible rather than merely unnoticed is worth understanding. On a reasoning model, a large share of what you are billed for is text the model generated while working out its answer and then discarded. It is reported in a different field from the answer, and it never appears in the response you receive. We caught one live: a model asked for a single word returned a single word, reported one output token in the field most cost tooling reads, and billed sixty-eight. Sixty-seven of those were thinking the model threw away.",
      },
      {
        t: "p",
        v: "What that proves is precise, and it is worth not overclaiming. It proves the bill for an unchanged request is free to move without the answer moving. It does not prove that it did move, for a particular workload, over a particular period. That is a different claim, and it requires the same task measured months apart.",
      },
      { t: "h2", v: "We did not have that measurement, so we started taking it" },
      {
        t: "p",
        v: "From this month, eight fixed tasks run against six pinned models on the first of every month, and the token counts each provider reports are recorded in an append-only log. The tasks span the shapes real production traffic actually takes: classification, structured extraction, summarisation under a length cap, open-ended rewriting, code generation, arithmetic, planning, and a single agent tool-call decision.",
      },
      {
        t: "p",
        v: "The discipline matters more than the coverage. The prompts are frozen in source and may not be edited in place, because a measurement taken in November against an edited prompt is not comparable to one taken in August. The fingerprint of the exact text sent is stored on every row, so an accidental edit shows up as a changed fingerprint rather than as drift. Failed calls are recorded as failures rather than dropped, so a gap in a series always states its reason. And no row can be edited or deleted after it is written.",
      },
      {
        t: "p",
        v: "There is no alerting attached to it yet, deliberately. One reading is not a series, and a comparison written today could not be tested against real history. Shipping the alarm before the readings is how tools end up reporting movement they cannot substantiate. The meter runs now so that the comparison, when it ships, has something real behind it.",
      },
      { t: "h2", v: "What each front actually justifies" },
      {
        t: "defs",
        items: [
          {
            term: "The market moves",
            text: "Proven from our own append-only price ledger. On its own, this is sufficient to make continuous monitoring rational.",
          },
          {
            term: "Your stack matures",
            text: "Reasoned, not measured by us. We will not cite it as our finding until our own history can separate a maturing workload from a growing one.",
          },
          {
            term: "The setup changes silently",
            text: "Mechanism proven with a captured artifact; the longitudinal case is not yet ours. The monthly meter above is what will settle it.",
          },
        ],
      },
      {
        t: "p",
        v: "Notice that the argument does not need all three. If prices move monthly and provably do, then a recommendation set derived from last quarter's prices is a historical document no matter how good it was when written. The other two fronts do not change that conclusion. They change how much of the movement you can currently see, and therefore how much of it is quietly costing you.",
      },
      { t: "h2", v: "What this means for how you buy" },
      {
        t: "p",
        v: "None of this makes a one-time audit worthless. An audit finds the standing waste, and standing waste is real money. What it cannot do is hold. The correct mental model is not consulting engagement versus software subscription; it is closer to the difference between having your accounts audited once and having a ledger. The audit tells you where you stood. The ledger tells you where you are.",
      },
      {
        t: "p",
        v: "The test to apply to anyone selling you either is the same test we apply to ourselves in public. Ask which of their claims are measured from their own data, which are mechanisms they can show you an artifact for, and which are reasoning they have not yet proven. A vendor who cannot separate those three about their own product will not separate them about your bill.",
      },
      {
        t: "cta",
        headline: "The four-rung framework this all builds toward, in one place",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
    ],
  },
  {
    slug: "cheapest-api-call",
    title: "What actually makes an API call cheap",
    deck: "Per-token list price is the headline. The cheapest API call is decided by which host you buy the same model from, and by how your traffic splits between input and output.",
    description:
      "How to find the cheapest API call for a given model: compare hosts for the same weights, weight input against output tokens, and price the blend you actually send.",
    keyword: "cheapest api call",
    published: "2026-08-23",
    minutes: 5,
    blocks: [
      {
        t: "p",
        v: "The question people type into a search box is short: what is the cheapest API call. The honest answer is that a price per million tokens is not a price per call, and the two can rank providers in opposite orders. A model that looks cheapest on a rate card can be the most expensive thing in your bill once your real ratio of input to output tokens is applied to it.",
      },
      { t: "h2", v: "Three numbers decide the cost of a call" },
      {
        t: "defs",
        items: [
          {
            term: "Input price",
            text: "What you pay per million tokens sent. Prompt-heavy workloads, long system prompts, retrieved context and pasted documents live here, and this is where caching discounts apply when a host offers them.",
          },
          {
            term: "Output price",
            text: "What you pay per million tokens generated, usually several times the input price. Summarisation is cheap on this axis; drafting, code generation and reasoning traces are not.",
          },
          {
            term: "Your blend",
            text: "The ratio between the two in your actual traffic. Ranking models on a 50/50 blend when your workload runs 10:1 input to output produces a recommendation that does not survive contact with your invoice.",
          },
        ],
      },
      {
        t: "p",
        v: "Multiply those three together and the cheapest call is rarely the cheapest headline number. It is the model whose price shape matches the shape of your requests.",
      },
      { t: "h2", v: "The same model is not one price" },
      {
        t: "p",
        v: "The largest avoidable overspend we see is not model choice at all. It is buying identical weights from the wrong host. The same open-weights model served by several providers, or a frontier model available both first-party and through a hyperscaler, can differ meaningfully in price while producing the same outputs. Nothing about your product changes when you move that traffic. Only the invoice changes.",
      },
      {
        t: "p",
        v: "This is why we treat the same-model gap as a separate line of enquiry from model substitution. Swapping models is a quality decision that has to be proven. Swapping hosts for the same model is a procurement decision, and the burden of proof is far lower.",
      },
      {
        t: "cta",
        headline: "Cheapest host per model, priced from the live catalog",
        label: "Open the cheapest API calls report",
        to: "/reports/cheapest-api-calls",
      },
      { t: "h2", v: "Cheap per call is not cheap per outcome" },
      {
        t: "p",
        v: "A cheaper model that needs two attempts, longer prompts, or a larger retrieval window to reach the same answer is not cheaper. Cost per useful result is the only figure that pays a bill, and it moves with retries, with output length, and with how often a human has to intervene. Any comparison that stops at the rate card is quietly assuming those are all constant across models, which they are not.",
      },
      {
        t: "p",
        v: "The practical test before you switch anything for price: does the output still clear your bar on the tasks you actually run, and does the total token count to get there stay flat. If either fails, the saving was arithmetic rather than money.",
      },
      { t: "h2", v: "Prices do not hold still" },
      {
        t: "p",
        v: "Whatever the cheapest call is today, it is a snapshot. Provider price changes, new model tiers and caching discounts move the ranking without any announcement reaching your engineering team. A comparison you ran last quarter is a historical document, which is why we keep the underlying price history append-only and re-derive the ranking rather than publishing a static table.",
      },
      {
        t: "cta",
        headline: "See every model, every host, priced side by side",
        label: "Browse the model catalog",
        to: "/models",
      },
    ],
  },
  {
    slug: "reduce-ai-costs-at-work",
    title: "How to reduce AI costs at work: five moves that actually work",
    deck: "Most AI savings come from the same five places: routing, caching, right-sizing, batching, and buying the same model from a cheaper host. Here is how to do each one responsibly.",
    description:
      "Practical ways to reduce AI costs at work: route routine work to smaller models, cache repeated context, right-size oversized workloads, use batch endpoints, and compare hosts for the same model.",
    keyword: "how to reduce ai costs for work",
    published: "2026-08-24",
    minutes: 7,
    blocks: [
      {
        t: "p",
        v: "The search query is personal: how to reduce AI costs for work. The answer is less personal than it sounds. Most organizations save money in the same five places once they can see where the money is actually going. The moves are not exotic. What separates real savings from quiet quality loss is doing them in the right order and proving the result before it goes live.",
      },
      { t: "h2", v: "1. Route routine work away from frontier models" },
      {
        t: "p",
        v: "The single largest lever is also the most neglected. A large share of production AI traffic does not need a frontier model. Classification, extraction, routing, simple summarization, and repetitive drafting all run well on smaller, cheaper models. The saving is not theoretical. In real deployments, routing high-volume routine tasks to a capable smaller model cuts the cost of that traffic by thirty to eighty five percent.",
      },
      {
        t: "p",
        v: "The catch is that the boundary between routine and hard is not universal. A task that is easy for one company may be hard for another because of domain language, output structure, or accuracy requirements. That is why routing has to be workload-specific, not a global rule, and why the cheaper model has to be measured against your actual task before any traffic moves.",
      },
      {
        t: "cta",
        headline: "See which models are cheapest for your actual blend",
        label: "Open the cheapest API calls report",
        to: "/reports/cheapest-api-calls",
      },
      { t: "h2", v: "2. Cache what you are paying to reprocess" },
      {
        t: "p",
        v: "Caching is the fastest way to cut a bill without changing models at all. There are two kinds. Prompt caching reuses a stable prefix, such as a system prompt or a long retrieved document, across consecutive calls. Semantic caching catches queries that are worded differently but mean the same thing and returns a previous answer instead of making a fresh model call.",
      },
      {
        t: "p",
        v: "Both depend on the shape of your traffic. A support bot that answers the same few dozen questions in different phrasing benefits from semantic caching. A retrieval pipeline that sends the same long document with every query benefits from prompt caching. One documented case cut a forty seven thousand dollar monthly bill to under thirteen thousand dollars by raising cache hit rate from eighteen to sixty seven percent. The saving was real, but it was specific to a workload with high repetition.",
      },
      { t: "h2", v: "3. Right-size the model to the task" },
      {
        t: "p",
        v: "Right-sizing means identifying workloads that are running on a more capable, more expensive model than the task requires. This is extremely common in early AI deployments because teams start with one model and never revisit the choice as the product matures. The result is simple tasks paying frontier prices.",
      },
      {
        t: "p",
        v: "The responsible version of this is not a blind downgrade. It is a measured one. You define the quality bar for that task, run the candidate model against it, and only switch if the measured output stays within an equivalence band. A downgrade that saves money on the invoice and costs more in rework was never a saving.",
      },
      {
        t: "cta",
        headline: "Browse live pricing and compare hosts for the same model",
        label: "Open the model catalog",
        to: "/models",
      },
      { t: "h2", v: "4. Move asynchronous work to batch endpoints" },
      {
        t: "p",
        v: "Nearly every major provider offers a batch endpoint at a steep discount in exchange for an asynchronous response window. Workloads that do not need a sub-second answer are obvious candidates: evaluation runs, enrichment jobs, classification at scale, and overnight report generation. Many teams never turn batching on because the default API is synchronous, not because their work requires it.",
      },
      {
        t: "p",
        v: "The discount is meaningful, often twenty five to fifty percent below the live rate. The constraint is latency tolerance and idempotency. Batch jobs are not a drop-in replacement for real-time traffic, but they are a near-free saving for any workload that can wait.",
      },
      { t: "h2", v: "5. Buy the same model from a cheaper host" },
      {
        t: "p",
        v: "This is the lowest-risk move on the list because nothing about the model changes. The same open-weights model served by different hosts, or a frontier model available both first-party and through a hyperscaler, can differ meaningfully in price while producing the same outputs. The saving is procurement, not architecture.",
      },
      {
        t: "p",
        v: "The work is comparing total cost, not headline rate. A host with a lower input price and a higher output price can be more expensive if your workload is output-heavy. A host with a higher list price but a deeper caching discount can be cheaper if your traffic repeats context. The only way to rank hosts correctly is to price your actual blend, not a generic one.",
      },
      {
        t: "cta",
        headline: "Track price moves as they happen, not after the invoice",
        label: "View the Intelligence page",
        to: "/intelligence",
      },
      { t: "h2", v: "What to do first" },
      {
        t: "p",
        v: "Start with visibility. You cannot route, cache, or right-size what you cannot see. The first step is a workload-level view of actual spend: which models, which hosts, and which tasks are driving the bill. Once you have that, the order of operations is usually host comparison first, because it is the lowest risk, then routing and caching, then right-sizing where the quality evidence supports it.",
      },
      {
        t: "p",
        v: "Batching is often the quickest win of all because it requires no model change and no quality proof. If you have asynchronous workloads still on the synchronous API, that is usually free money sitting on the table.",
      },
      {
        t: "cta",
        headline: "The four-rung framework that ties this together",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
      { t: "h2", v: "The mistake that undoes most of these savings" },
      {
        t: "p",
        v: "The most common failure mode is treating a cheaper model as a proven equivalent without measuring it. Every article on this topic includes the warning, and most stop there. The practical requirement is an independent benchmark for the specific task type, a defined equivalence band that accounts for measurement uncertainty, and a system that reports when a candidate does not clear the bar rather than quietly recommending it anyway.",
      },
      {
        t: "p",
        v: "Cost reduction without quality guardrails is just a slower way to discover that you cut the wrong thing. The organizations that reduce AI costs sustainably are the ones that make the proof as routine as the switch.",
      },
    ],
  },
  {
    slug: "return-on-ai",
    title: "Return on AI: the ratio CFOs are asking for instead of a usage dashboard",
    deck: "Cost control answers what you spent. Return on AI answers whether it was worth it. Here is how to build the ratio without inventing numbers.",
    description:
      "Return on AI measures outcome against cost, not activity. How to define the numerator and denominator honestly, and why AI value management is replacing usage dashboards.",
    keyword: "return on AI",
    published: "2026-08-23",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "Most AI reporting still answers the wrong question. A usage dashboard tells you how many tokens moved, which team moved them, and what the invoice came to. It cannot tell you whether any of that was worth doing. That gap is why finance leaders have started asking for a single ratio instead: return on AI, the value delivered divided by the fully loaded cost of delivering it.",
      },
      { t: "h2", v: "Why activity metrics stopped being enough" },
      {
        t: "p",
        v: "In the first wave of adoption, activity was a reasonable proxy for progress. Rising token volume meant teams were actually using the thing. That proxy has expired. Volume now rises for reasons that have nothing to do with value: agent retries, longer context windows, redundant retrieval, and workloads nobody has revisited since launch. A dashboard that celebrates growing usage is, in a lot of organizations, celebrating waste.",
      },
      {
        t: "p",
        v: "Return on AI forces the harder conversation because it has a denominator. Every incremental call has to justify itself against an outcome, and outcomes are measured in the same units the rest of the business already reports in.",
      },
      { t: "h2", v: "Building the denominator honestly" },
      {
        t: "p",
        v: "The cost side is the part you can actually be precise about, and most organizations still get it wrong by understating it. A fully loaded AI cost is not just the model invoice. It includes inference spend across every host, the retrieval and vector infrastructure the workload depends on, the evaluation runs that keep it honest, the human review time it still requires, and the engineering time spent maintaining the pipeline. Leave any of those out and the ratio flatters itself.",
      },
      {
        t: "p",
        v: "The denominator also has to be attributable to a workload, not to a department. Departmental allocation hides the specific thing that is expensive. Workload-level cost is what makes the ratio actionable, because a workload is the unit you can actually change.",
      },
      {
        t: "cta",
        headline: "See what the same workload costs across every host",
        label: "Open the model catalog",
        to: "/models",
      },
      { t: "h2", v: "Building the numerator without inventing it" },
      {
        t: "p",
        v: "The numerator is where most return on AI exercises quietly become fiction. Hours saved multiplied by a blended hourly rate is the standard move, and it is almost always inflated, because saved hours are only worth money if they were reallocated to something that produced revenue or avoided a real cost. If nobody left, nobody was redeployed, and no external spend fell, the saving exists in a slide and nowhere else.",
      },
      {
        t: "p",
        v: "The defensible numerators are narrower and duller: external spend that actually disappeared from a budget line, revenue attributable to a measurable conversion change, penalties or errors avoided with a documented prior rate, and cycle time reductions that removed a real bottleneck with a known cost. If a value claim cannot survive being asked where the money physically went, it does not belong in the ratio.",
      },
      { t: "h2", v: "Value management is not the same as cost control" },
      {
        t: "p",
        v: "AI value management sits one layer above cost governance. Cost governance keeps spend defensible: right models, right hosts, right guardrails, no silent quality loss. Value management decides which workloads deserve to exist at all. A workload can be perfectly optimized and still be worth cancelling, and no amount of routing or caching will surface that. Only the ratio does.",
      },
      {
        t: "p",
        v: "The practical consequence is a portfolio view. Some workloads earn a clear multiple and should be funded harder. Some sit near break-even and are worth optimizing before any further investment. Some are negative and have survived purely because nobody put a denominator next to them.",
      },
      {
        t: "cta",
        headline: "The four-rung framework behind measurable AI governance",
        label: "Read The CostMyAI Standard",
        to: "/standard",
      },
      { t: "h2", v: "Where to start" },
      {
        t: "p",
        v: "Pick your three largest AI workloads by spend. Compute a fully loaded monthly cost for each one at the workload level. Write down the single outcome each workload is supposed to produce, and the evidence that it did. Publish the three ratios, including the uncomfortable ones. The exercise is more valuable for what it disqualifies than for what it justifies, and it takes days rather than quarters.",
      },
      {
        t: "p",
        v: "Return on AI is not a new dashboard. It is a discipline of refusing to report activity as if it were value, and it starts with cost data granular enough to divide by something real.",
      },
    ],
  },
  {
    slug: "ai-cost-forecast-gap",
    title: "Why AI costs overshoot the forecast, and what to do in the first week",
    deck: "The gap is rarely a pricing surprise. It is retries, context growth, and workloads nobody re-examined. Here is how to close it.",
    description:
      "AI budgets overshoot because token volume grows for reasons forecasts never modelled: retries, context creep, and new workloads. The specific causes and the fixes.",
    keyword: "AI cost forecast",
    published: "2026-08-23",
    minutes: 6,
    blocks: [
      {
        t: "p",
        v: "The most common finance complaint about AI is not that it is expensive. It is that it is unpredictable in one direction. Budgets set in good faith are overrun by margins that would be a scandal in any other line item, and the post-mortem almost never finds a price increase. Unit prices generally fell. Volume did something the forecast never modelled.",
      },
      { t: "h2", v: "The five things that actually blow the number" },
      {
        t: "defs",
        items: [
          {
            term: "Retries and agent loops",
            text: "An agentic workflow does not make one call, it makes a chain of them, and every failed step, tool call, and self-correction is billed. A workflow forecast at one call per task can settle at eight in production without anyone changing the code.",
          },
          {
            term: "Context creep",
            text: "Prompts grow. A system prompt gains guardrails, retrieval returns more chunks, conversation history is carried further. Input tokens per call rise quietly for months, and input tokens are the bulk of most bills.",
          },
          {
            term: "Reasoning output",
            text: "Reasoning-style models emit tokens you never see and always pay for. A model swap that looked cost-neutral on the published rate card can double effective cost per task.",
          },
          {
            term: "Unmodelled workloads",
            text: "The forecast covered the two workloads that existed at planning time. By month four there are nine, several launched by teams who never touched the budget line.",
          },
          {
            term: "Host drift",
            text: "The same model is available from several hosts at materially different prices. Traffic lands wherever the first integration pointed, and nobody re-checks after the market moves.",
          },
        ],
      },
      { t: "h2", v: "Forecast the driver, not the invoice" },
      {
        t: "p",
        v: "A forecast built by extrapolating last quarter's invoice is guessing at the output of a system it does not model. A forecast built on drivers is auditable: calls per unit of business activity, tokens per call split into input and output, and the price per token of the model and host actually serving that workload. When the number moves, you can say which of the three moved and by how much. That is the entire difference between a forecast and a hope.",
      },
      {
        t: "cta",
        headline: "See where the cheapest host for your model actually is",
        label: "Open the cheapest API calls report",
        to: "/reports/cheapest-api-calls",
      },
      { t: "h2", v: "Track variance weekly, not at month end" },
      {
        t: "p",
        v: "Most overruns are visible in week one and discovered in week five. A workload whose tokens per call jumped forty percent after a prompt change announces itself immediately if anyone is watching that ratio, and hides completely inside a monthly total. Weekly variance against the driver forecast, per workload, catches the structural break while it is still cheap to reverse.",
      },
      {
        t: "p",
        v: "The threshold matters as much as the cadence. An alert on every fluctuation gets muted within a fortnight. An alert on a sustained change in tokens per call, or on a new workload appearing with no forecast line, stays credible because it fires rarely and is right when it does.",
      },
      { t: "h2", v: "Budget a range, and say why" },
      {
        t: "p",
        v: "A single-point AI budget is a fiction with a decimal place. The honest artefact is a range with a stated basis: the floor assumes current usage patterns hold, the mid case assumes planned launches ship on schedule, the ceiling assumes usage per user rises at the rate it has been rising. Finance can plan against a range with reasoning behind it. Nobody can plan against a confident number that turns out to be wrong by half.",
      },
      {
        t: "cta",
        headline: "What the market actually did this month",
        label: "Read the latest intelligence",
        to: "/intelligence",
      },
      { t: "h2", v: "The first week of work" },
      {
        t: "p",
        v: "Split current spend by workload rather than by provider. For the top three, record calls per task and tokens per call as they stand today, because that is the baseline every future variance is measured against. Check whether each one is served by the cheapest host offering the identical model. Then set a weekly review on those two ratios. None of this requires new tooling, and it converts the overshoot from an annual surprise into a weekly, fixable signal.",
      },
    ],
  },
];



export const postBySlug = (slug: string): BlogPost | null =>
  POSTS.find((p) => p.slug === slug) ?? null;

/** Newest first, which is the order the index renders. */
export const postsNewestFirst = (): BlogPost[] =>
  [...POSTS].sort((a, b) => (a.published < b.published ? 1 : -1));

export const formatPublished = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
