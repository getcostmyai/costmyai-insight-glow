const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

/** Renders nothing once live keys are in place. */
export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        Checkout is not configured for this build yet.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-primary/25 bg-primary-soft px-4 py-2 text-center text-sm text-primary">
        Test mode — payments made here are not real charges.
      </div>
    );
  }
  return null;
}
