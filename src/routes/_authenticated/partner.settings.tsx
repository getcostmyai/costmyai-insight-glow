import { createFileRoute } from "@tanstack/react-router";

import { usePartnerData } from "@/components/partner/partner-context";
import { BrandKitCard } from "@/components/partner/BrandKitCard";
import { PartnerSettingsCard } from "@/components/partner/PartnerSettingsCard";
import {
  SHOW_PARTNER_BADGE_ASSETS,
} from "@/lib/partner-panels";

export const Route = createFileRoute("/_authenticated/partner/settings")({
  head: () => ({
    meta: [
      { title: "Partner settings — CostMyAI" },
      {
        name: "description",
        content:
          "Your partner account details: name, company, contact and address. The email your account is matched on is shown here and changed on request.",
      },
      { property: "og:title", content: "Partner settings — CostMyAI" },
      {
        property: "og:description",
        content: "Your partner account details and contact information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerSettings,
});

function PartnerSettings() {
  const { partner } = usePartnerData();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your partner account details. Bank, tax and identity live with our payment provider, not
        here.
      </p>

      <PartnerSettingsCard partner={partner} />

      {SHOW_PARTNER_BADGE_ASSETS ? (
        <BrandKitCard referralCode={partner.referralCode} active={partner.status === "active"} />
      ) : null}
    </div>
  );
}
