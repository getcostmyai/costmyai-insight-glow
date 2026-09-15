import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";

import type { PartnerDashboard } from "@/lib/partners.functions";
import { updateMyPartnerProfile } from "@/lib/partner-profile.functions";

/**
 * The partner's own details.
 *
 * Bank, tax and identity are deliberately absent: our payment provider owns
 * those through Connect onboarding and we do not keep a second copy. The
 * contact email is shown but never editable here, because it is the address a
 * signing-in account is matched on.
 */

const field =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block text-xs text-muted-foreground ${className}`}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={field}
      />
    </label>
  );
}

export function PartnerSettingsCard({ partner }: { partner: PartnerDashboard["partner"] }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const canEdit = partner.role === "owner";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateMyPartnerProfile({
        data: {
          name: value("name"),
          companyName: value("companyName"),
          phone: value("phone"),
          website: value("website"),
          addressLine1: value("addressLine1"),
          addressLine2: value("addressLine2"),
          city: value("city"),
          postalCode: value("postalCode"),
          country: value("country"),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-partner"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save your details. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Settings</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Your details as they appear to us. Bank details, tax forms and identity stay with our
        payment provider, we never hold a second copy.
      </p>

      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={partner.name} />
        <Field
          label="Company name"
          name="companyName"
          defaultValue={partner.profile.companyName ?? ""}
        />
        <Field label="Phone" name="phone" type="tel" defaultValue={partner.profile.phone ?? ""} />
        <Field
          label="Website"
          name="website"
          defaultValue={partner.profile.website ?? ""}
          placeholder="https://"
        />
        <Field
          label="Address line 1"
          name="addressLine1"
          defaultValue={partner.profile.addressLine1 ?? ""}
          className="sm:col-span-2"
        />
        <Field
          label="Address line 2"
          name="addressLine2"
          defaultValue={partner.profile.addressLine2 ?? ""}
          className="sm:col-span-2"
        />
        <Field label="City" name="city" defaultValue={partner.profile.city ?? ""} />
        <Field
          label="Postal code"
          name="postalCode"
          defaultValue={partner.profile.postalCode ?? ""}
        />
        <Field
          label="Country"
          name="country"
          defaultValue={partner.profile.country ?? ""}
          className="sm:col-span-2"
        />

        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground">Contact email</p>
          <p className="mt-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            {partner.contactEmail ?? "Not set"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the address your account is matched on when you sign in, so it is not editable
            here. Ask us and we will change it for you.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={busy || !canEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Save details"}
          </button>
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {error ? error : saved ? "Saved." : null}
          </span>
        </div>
      </form>

      {canEdit ? null : (
        <p className="mt-3 text-xs text-muted-foreground">
          Only the owner of this partner account can change these details.
        </p>
      )}
    </section>
  );
}
