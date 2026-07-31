/**
 * Reviewer alert for a new partner application.
 *
 * The confirmation screen promises a human reply within a stated window, so a
 * new application has to reach a person without anyone remembering to open the
 * admin page. The alert goes to an incoming webhook (Slack or any endpoint that
 * accepts a JSON POST), configured as `PARTNER_ALERT_WEBHOOK_URL`.
 *
 * A failed or unconfigured alert never loses the application: the reason is
 * written to the row and shown in the review queue, so the gap is visible
 * instead of silent.
 */

export interface ReviewerAlert {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  activeClients: string;
  startingSoon: string;
  path: "meeting" | "async";
  escalated: boolean;
}

export interface AlertResult {
  sent: boolean;
  error: string | null;
}

function summarize(a: ReviewerAlert): string {
  const route =
    a.path === "meeting"
      ? a.escalated
        ? "meeting (escalated on near-term pipeline)"
        : "meeting (101+ active clients)"
      : "async review queue";
  return [
    `*New partner application* — ${a.company}`,
    `${a.name} · ${a.email} · ${a.phone}`,
    `Active clients: ${a.activeClients} · Starting in 3 weeks: ${a.startingSoon}`,
    `Routed to: ${route}`,
    `Review: /admin/partner-applications`,
  ].join("\n");
}

export async function notifyReviewers(alert: ReviewerAlert): Promise<AlertResult> {
  const url = process.env["PARTNER_ALERT_WEBHOOK_URL"];
  if (!url) {
    return { sent: false, error: "No reviewer alert webhook is configured" };
  }

  const text = summarize(alert);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is what Slack renders; the structured fields let any other
      // endpoint read the application without parsing prose.
      body: JSON.stringify({ text, application: alert }),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200);
      return { sent: false, error: `Alert endpoint returned ${response.status}: ${body}` };
    }
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Alert failed" };
  }
}
