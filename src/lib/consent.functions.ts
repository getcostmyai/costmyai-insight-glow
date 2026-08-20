import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { RATE_RULES, callerIdentity, enforceRateLimit } from "@/lib/rate-limit.server";
import { writeConsentRecord } from "@/lib/consent.server";

const input = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  method: z.enum(["password_signup", "google_signup"]),
});

/** Records the signup-time acceptance of the Terms and Privacy Policy. */
export const recordSignupConsent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }) => {
    await enforceRateLimit(RATE_RULES.consent, callerIdentity(getRequest()));
    return writeConsentRecord(data);
  });
