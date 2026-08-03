export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

export interface FaqCluster {
  id: string;
  title: string;
  lead: string;
  items: FaqItem[];
}

export const FAQ_CLUSTERS: FaqCluster[] = [
  {
    id: "ai-cost-basics",
    title: "AI cost and pricing basics",
    lead: "What actually drives an AI bill, and why the published averages will not help you budget.",
    items: [
      {
        id: "how-much-does-ai-cost-a-business",
        q: "How much does AI actually cost a business?",
        a: "There is no single answer, and most published numbers you will find online are averages across wildly different use cases, which makes them close to useless for your own budget. What actually determines your cost is usage volume, which models you run each workload on, and whether you have turned on any of the standard discount mechanisms, caching, batching, volume pricing, that most teams never enable. The only number that matters is your own, measured in real time against your own traffic, not an industry average.",
      },
      {
        id: "why-is-my-ai-bill-higher-than-expected",
        q: "Why is my AI bill higher than I expected, even though token prices keep falling?",
        a: "Per token prices have fallen dramatically over the past two years, and bills have still gone up for most organizations running AI at any real scale. The reason is consumption, not price. Agentic workflows, where a model plans, calls tools, checks its own work, and iterates, can use ten to thirty times more tokens per completed task than a single chatbot style request. A falling price per token does very little to offset a workload quietly generating thirty times as many tokens to finish the same job.",
      },
      {
        id: "input-vs-output-token-pricing",
        q: "What is the difference between input and output token pricing?",
        a: "Input tokens are the text you send a model, output tokens are the text it generates back, and providers price them separately, almost always at different rates, with output typically costing several times more than input for the same model. A model that looks cheap based on its input price alone can be expensive in practice if your workload generates a lot of output.",
      },
      {
        id: "reasoning-models-hidden-cost",
        q: "Why do reasoning models cost more than the sticker price suggests?",
        a: "Models that think step by step before answering generate internal reasoning tokens that get billed as output, even though you never see them in the response. This makes the real cost per useful, visible answer meaningfully higher than the headline output rate implies, and it is one of the most common reasons a bill runs higher than a simple token calculation would predict.",
      },
    ],
  },
  {
    id: "switching-safely",
    title: "Switching models and providers safely",
    lead: "Price and quality do not move together. Here is how a switch gets proven, and when it gets refused.",
    items: [
      {
        id: "cheaper-model-lower-quality",
        q: "Does a cheaper AI model always mean lower quality?",
        a: "No, and this is one of the most common misconceptions in AI budgeting. Model pricing and model quality do not move together in a straight line. Competitive pressure and efficiency gains mean a meaningfully cheaper model can perform equivalently to a more expensive one on a specific task, while being genuinely worse on a different task. The only reliable way to know which is true for your workload is to measure it, not assume it from the price tag.",
      },
      {
        id: "will-switching-hurt-quality",
        q: "How do I know if switching to a cheaper model will hurt my output quality?",
        a: "Test it against an independent, task specific benchmark before you switch any real traffic, not a general leaderboard score and not a spot check on a handful of examples. The comparison needs to account for the benchmark's own measurement uncertainty too. Two models scoring within a few points of each other might not be meaningfully different at all, or they might be, and you cannot tell which without knowing the margin.",
      },
      {
        id: "multi-provider-risk",
        q: "Is it risky to route AI traffic across multiple providers?",
        a: "The bigger risk is usually the opposite: depending entirely on one provider. A single vendor relationship means no fallback if that provider raises prices, changes availability, or has an outage, and no leverage to negotiate anything once you are fully dependent. A properly built multi-provider setup, where switching is a certified, proven decision rather than a guess, reduces risk rather than adding it.",
      },
      {
        id: "no-safe-alternative",
        q: "What happens if no safe alternative exists for a given model?",
        a: "The honest answer should be that nothing gets switched, with the specific reason stated, not a quieter downgrade suggested anyway. If a cheaper candidate cannot be shown to perform equivalently on an independent benchmark for that exact task, recommending it anyway trades a visible cost saving for an invisible quality risk, which is not actually a saving.",
      },
    ],
  },
  {
    id: "keys-and-trust",
    title: "API keys, credentials, and trust",
    lead: "Your provider keys stay in your environment. That is architecture, not policy.",
    items: [
      {
        id: "safe-to-share-api-keys",
        q: "Is it safe to give an AI cost tracking tool my provider API keys?",
        a: "You should be cautious about this, and the caution is justified. An API key is a live credential with direct access to billable resources and, depending on the provider, to real usage data. Handing a raw key to a third party service means trusting that service's own security indefinitely, and if that service is ever compromised, your key is compromised with it.",
      },
      {
        id: "does-costmyai-hold-keys",
        q: "Does CostMyAI ever hold or see my provider API keys?",
        a: "No. The component that reads your usage data runs inside your own environment, not ours, and your provider keys never leave it. We built the architecture this way specifically so that getting visibility into your AI spend never requires a new leap of trust in a third party holding your credentials.",
      },
      {
        id: "what-data-costmyai-sees",
        q: "What data does CostMyAI actually see, if not my API keys?",
        a: "Aggregate, provider neutral records of usage and billed spend, pushed from your own environment. Not your prompts, not your model outputs, unless you explicitly choose to share that separately.",
      },
      {
        id: "why-invoice-says-link-llc",
        q: "Why does my invoice say Link, LLC instead of CostMyAI?",
        a: "Payments run through Link, LLC, our payment processor. They collect the money and issue the invoice. CostMyAI is the product you're paying for. Same subscription, same support, different name on the receipt.",
      },
    ],
  },
  {
    id: "governance-and-finops",
    title: "Governance, visibility, and FinOps for AI",
    lead: "Financial Governance for spend that behaves nothing like a software subscription.",
    items: [
      {
        id: "what-is-shadow-ai-spend",
        q: "What is Shadow AI spend?",
        a: "Shadow AI spend is money an organization is spending on AI tools that were never reviewed or approved by IT or procurement, often small individual subscriptions that look trivial one at a time and become a real, uncounted line item once added up across an entire company. Audits routinely surface hundreds of unsanctioned tools and significant unconsolidated spend once someone actually looks.",
      },
      {
        id: "what-is-finops-for-ai",
        q: "What is FinOps for AI, and how is it different from regular cloud FinOps?",
        a: "FinOps for AI applies the same discipline, cost visibility, allocation, and optimization, that cloud FinOps built over the last decade, but adapted for AI's specific cost behavior: usage based token billing that moves with consumption rather than provisioning, spend that crosses multiple providers and billing models at once, and unpredictability driven by workloads like autonomous agents that can generate cost without a human directly triggering each request. It is now recognized as its own distinct category within the FinOps discipline, not a subcategory of cloud cost management.",
      },
      {
        id: "why-cant-companies-forecast-ai-spend",
        q: "Why can't most companies accurately forecast their AI spend?",
        a: "Traditional budgeting assumes relatively stable costs, a license renews at a known price, a server costs about the same this month as last. AI spend does not behave that way. The same feature can cost meaningfully more or less month to month purely from usage shifts, with no provisioning decision behind the change, which is why simple trailing averages consistently produce the wrong forecast.",
      },
      {
        id: "visibility-across-the-company",
        q: "How do I get real visibility into AI spend across my whole company?",
        a: "Start with an honest inventory of what is actually running, not what was formally approved, since the two are rarely the same list. From there, visibility only stays useful if it reads real billed spend directly, not an estimate built from multiplying tokens by a published rate, since volume discounts, caching, and batch processing all mean the estimate and the real invoice routinely diverge.",
      },
    ],
  },
];

export const FAQ_ITEMS: FaqItem[] = FAQ_CLUSTERS.flatMap((c) => c.items);

export function findFaqItem(id: string): FaqItem | undefined {
  return FAQ_ITEMS.find((i) => i.id === id);
}

/** Questions teased on the homepage, highest search intent first. */
export const HOMEPAGE_FAQ_IDS = [
  "cheaper-model-lower-quality",
  "safe-to-share-api-keys",
  "what-is-shadow-ai-spend",
  "why-is-my-ai-bill-higher-than-expected",
] as const;

export const faqJsonLd = () =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  });
