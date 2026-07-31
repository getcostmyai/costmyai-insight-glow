import { useState } from "react";

/**
 * Provider wordmark + logo.
 *
 * The catalog now carries ~70 real providers from the live OpenRouter feed and
 * grows on its own, so a hand-mapped table alone would leave most providers
 * bare. Resolution is therefore two-stage:
 *
 *  1. A curated domain for providers whose brand domain is not derivable from
 *     their display name (Z.AI -> z.ai, Amazon Bedrock -> aws.amazon.com, ...).
 *     Curated entries always win, so a known brand can never resolve to an
 *     unrelated company.
 *  2. Otherwise a derived guess from the display name (`name.ai`, then
 *     `name.com`), checked against Logo.dev with `fallback=404`.
 *
 * If nothing resolves we show the provider's name alone — never a generic
 * placeholder mark, which would imply a brand we cannot verify.
 */
const DOMAINS: Record<string, string> = {
  AI21: "ai21.com",
  AionLabs: "aionlabs.ai",
  AkashML: "akash.network",
  "Alibaba Cloud": "alibabacloud.com",
  "Alibaba DashScope": "alibabacloud.com",
  Alibaba: "alibabacloud.com",
  "Amazon Bedrock": "aws.amazon.com",
  Anthropic: "anthropic.com",
  "Arcee AI": "arcee.ai",
  AtlasCloud: "atlascloud.ai",
  Azure: "azure.microsoft.com",
  "Azure AI Foundry": "azure.microsoft.com",
  Baidu: "baidu.com",
  BaseTen: "baseten.co",
  Cerebras: "cerebras.ai",
  Chutes: "chutes.ai",
  "Claude Platform on AWS": "aws.amazon.com",
  Cloudflare: "cloudflare.com",
  Cohere: "cohere.com",
  CoreWeave: "coreweave.com",
  Crusoe: "crusoe.ai",
  Decart: "decart.ai",
  DeepInfra: "deepinfra.com",
  DeepSeek: "deepseek.com",
  DigitalOcean: "digitalocean.com",
  Fireworks: "fireworks.ai",
  Friendli: "friendli.ai",
  GMICloud: "gmicloud.ai",
  Google: "google.com",
  "Google AI Studio": "ai.google",
  Groq: "groq.com",
  Inception: "inceptionlabs.ai",
  Inceptron: "inceptron.io",
  Ionstream: "ionstream.ai",
  IonStream: "ionstream.ai",
  "Io Net": "io.net",
  Mancer: "mancer.tech",
  "Mancer 2": "mancer.tech",
  Meta: "meta.com",
  Minimax: "minimax.io",
  Mistral: "mistral.ai",
  Modal: "modal.com",
  "Moonshot AI": "moonshot.ai",
  Morph: "morphllm.com",
  Nebius: "nebius.com",
  Novita: "novita.ai",
  OpenAI: "openai.com",
  OpenRouter: "openrouter.ai",
  Parasail: "parasail.io",
  Perplexity: "perplexity.ai",
  Phala: "phala.network",
  Poolside: "poolside.ai",
  Reka: "reka.ai",
  "Sakana AI": "sakana.ai",
  SambaNova: "sambanova.ai",
  SiliconFlow: "siliconflow.com",
  StepFun: "stepfun.com",
  StreamLake: "streamlake.ai",
  Tencent: "tencent.com",
  Together: "together.ai",
  "Together AI": "together.ai",
  Upstage: "upstage.ai",
  Venice: "venice.ai",
  "Venice AI": "venice.ai",
  "Weights & Biases": "wandb.ai",
  Xiaomi: "mi.com",
  xAI: "x.ai",
  "Z.AI": "z.ai",
};

/** Display name -> bare slug used for the derived domain guesses. */
function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Candidate domains in confidence order. A curated hit is used on its own; a
 * derived guess gets two shots (.ai is the far more common suffix among these
 * providers) before we give up and render the name alone.
 */
export function providerDomains(label: string): string[] {
  const curated = DOMAINS[label];
  if (curated) return [curated];
  const slug = slugify(label);
  if (!slug) return [];
  return [`${slug}.ai`, `${slug}.com`];
}

export function providerDomain(label: string) {
  return providerDomains(label)[0];
}

export function ProviderLogo({ label, size = 28 }: { label: string; size?: number }) {
  const [attempt, setAttempt] = useState(0);
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY;
  const candidates = providerDomains(label);
  const domain = candidates[attempt];

  return (
    <span className="flex items-center gap-3 whitespace-nowrap">
      {domain && token ? (
        <img
          key={domain}
          src={`https://img.logo.dev/${domain}?token=${token}&size=${size * 3}&format=png&fallback=404`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={size}
          height={size}
          onError={() => setAttempt((a) => a + 1)}
          className="rounded-md object-contain opacity-100 transition duration-300 hover:opacity-90"
          style={{ width: size, height: size }}
        />
      ) : null}
      <span className="text-lg font-semibold tracking-tight text-muted-foreground/70">{label}</span>
    </span>
  );
}
