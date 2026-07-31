import { useState } from "react";

/**
 * Provider wordmark + logo.
 *
 * Logos are fetched by domain from Logo.dev at render time, so a provider that
 * appears in the catalog tomorrow needs no asset commit. If a domain is unknown
 * or the fetch fails we fall back to the provider's name alone — never to a
 * generic placeholder mark, which would imply a brand we cannot verify.
 */
const DOMAINS: Record<string, string> = {
  "Alibaba Cloud": "alibabacloud.com",
  "Alibaba DashScope": "alibabacloud.com",
  Anthropic: "anthropic.com",
  "Azure AI Foundry": "azure.microsoft.com",
  DeepInfra: "deepinfra.com",
  Groq: "groq.com",
  IonStream: "ionstream.ai",
  OpenAI: "openai.com",
  "Together AI": "together.ai",
  "Venice AI": "venice.ai",
  "Weights & Biases": "wandb.ai",
};

export function providerDomain(label: string) {
  return DOMAINS[label];
}

export function ProviderLogo({ label, size = 28 }: { label: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY;
  const domain = providerDomain(label);

  return (
    <span className="flex items-center gap-3 whitespace-nowrap">
      {domain && token && !failed ? (
        <img
          src={`https://img.logo.dev/${domain}?token=${token}&size=${size * 3}&format=png&fallback=404`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="rounded-md object-contain opacity-80 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
          style={{ width: size, height: size }}
        />
      ) : null}
      <span className="text-lg font-semibold tracking-tight text-muted-foreground/70">{label}</span>
    </span>
  );
}
