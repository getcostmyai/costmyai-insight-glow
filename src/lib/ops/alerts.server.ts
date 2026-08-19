/**
 * Outbound alerting for the scheduled jobs — the push half of the jobs board.
 *
 * Until now a failed or stalled job was recorded faithfully in `sync_runs` and
 * then waited for somebody to open /admin/jobs. That is a pull-only channel: the
 * 1 August usage hole was visible on the board for days before anyone looked.
 *
 * Nothing new is invented here. The verdicts come from `judgeJob`, the same
 * function the board and the audit script use, and delivery reuses the outbound
 * JSON webhook already proven by the partner-application reviewer alert, with
 * the managed transactional email path as the fallback when no webhook is
 * configured or the webhook refuses.
 *
 * Edge-triggered, not level-triggered: the alert fires when a job's verdict
 * *changes* into an unhealthy state (and once more when it recovers). The last
 * alerted verdict per job lives in `job_alert_state`, so a job that stays broken
 * for a day produces one alert, not ninety-six.
 */

import {
  JOB_REGISTRY,
  UNHEALTHY,
  judgeJob,
  type JobHealth,
  type JobRunSummary,
} from "@/lib/ops/jobs";

export interface JobAlertOutcome {
  job: string;
  verdict: string;
  previous: string | null;
  kind: "raised" | "recovered";
  channel: string | null;
  delivered: boolean;
  error: string | null;
}

export interface JobAlertSweep {
  checked: number;
  unhealthy: number;
  alerts: JobAlertOutcome[];
  failures: number;
}

/** Judge every registered job from the ledger. Shared with the board's shape. */
export async function collectJobHealth(nowMs = Date.now()): Promise<JobHealth[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const byJob = new Map<string, JobRunSummary[]>();
  // Per job, so one chatty job's history cannot crowd another out of the read
  // — the standing rule that a bounded read must be bounded per subject.
  await Promise.all(
    JOB_REGISTRY.map(async (spec) => {
      const { data, error } = await supabaseAdmin
        .from("sync_runs")
        .select("job, started_at, outcome, rows_written, error")
        .eq("job", spec.job)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      byJob.set(
        spec.job,
        (data ?? []).map((row) => ({
          startedAt: String(row.started_at),
          outcome: row.outcome ?? null,
          rowsWritten: row.rows_written ?? null,
          error: row.error ?? null,
        })),
      );
    }),
  );

  return JOB_REGISTRY.map((spec) => judgeJob(spec, byJob.get(spec.job) ?? [], nowMs));
}

function summarize(health: JobHealth, kind: "raised" | "recovered"): string {
  return kind === "recovered"
    ? [
        `*Recovered* — ${health.label} (${health.job})`,
        health.reason,
        `Board: /admin/jobs`,
      ].join("\n")
    : [
        `*Scheduled job ${health.verdict}* — ${health.label} (${health.job})`,
        health.reason,
        `Schedule: ${health.schedule} · last run ${health.lastRunAt ?? "never"}`,
        `What it does: ${health.what}`,
        `Board: /admin/jobs`,
      ].join("\n");
}

interface Delivery {
  channel: string | null;
  delivered: boolean;
  error: string | null;
}

/** Webhook first, managed email second. A silent alert is the one failure mode that matters. */
async function deliver(health: JobHealth, kind: "raised" | "recovered"): Promise<Delivery> {
  const text = summarize(health, kind);
  const url = process.env["OPS_ALERT_WEBHOOK_URL"] ?? process.env["PARTNER_ALERT_WEBHOOK_URL"];

  if (url) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          alert: {
            job: health.job,
            label: health.label,
            verdict: health.verdict,
            reason: health.reason,
            lastRunAt: health.lastRunAt,
            kind,
          },
        }),
      });
      if (response.ok) return { channel: "webhook", delivered: true, error: null };
      const body = (await response.text()).slice(0, 200);
      const webhookError = `Alert endpoint returned ${response.status}: ${body}`;
      const fallback = await deliverEmail(health, kind, text);
      return {
        channel: fallback.delivered ? "email" : "webhook",
        delivered: fallback.delivered,
        error: fallback.delivered ? webhookError : `${webhookError}; ${fallback.error}`,
      };
    } catch (err) {
      const webhookError = err instanceof Error ? err.message : String(err);
      const fallback = await deliverEmail(health, kind, text);
      return {
        channel: fallback.delivered ? "email" : "webhook",
        delivered: fallback.delivered,
        error: fallback.delivered ? webhookError : `${webhookError}; ${fallback.error}`,
      };
    }
  }

  const fallback = await deliverEmail(health, kind, text);
  return { channel: "email", delivered: fallback.delivered, error: fallback.error };
}

async function deliverEmail(
  health: JobHealth,
  kind: "raised" | "recovered",
  text: string,
): Promise<{ delivered: boolean; error: string | null }> {
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("ops-alert", "", {
      templateData: {
        job: health.job,
        label: health.label,
        verdict: kind === "recovered" ? "recovered" : health.verdict,
        reason: health.reason,
        lastRunAt: health.lastRunAt ?? "never",
        body: text,
      },
      // One send per job per verdict transition, so a retried sweep cannot
      // duplicate the mail.
      idempotencyKey: `job-alert:${health.job}:${kind}:${health.verdict}:${health.lastRunAt ?? "never"}`,
    });
    return { delivered: result.sent, error: result.sent ? null : "recipient_suppressed" };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Check every job and alert on transitions only.
 *
 * `force` re-sends for currently-unhealthy jobs regardless of stored state —
 * used to prove the path end to end without waiting for a real regression.
 */
export async function runJobAlerts(
  opts: { force?: boolean; only?: string[] } = {},
): Promise<JobAlertSweep> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const health = (await collectJobHealth()).filter(
    (h) => !opts.only || opts.only.includes(h.job),
  );

  const { data: stateRows, error: stateError } = await supabaseAdmin
    .from("job_alert_state")
    .select("job, verdict");
  if (stateError) throw stateError;
  const previous = new Map<string, string>(
    (stateRows ?? []).map((r) => [String(r.job), String(r.verdict)]),
  );

  const alerts: JobAlertOutcome[] = [];
  let failures = 0;

  for (const h of health) {
    const unhealthy = UNHEALTHY.includes(h.verdict);
    const was = previous.get(h.job) ?? null;
    const wasUnhealthy = was !== null && UNHEALTHY.includes(was as JobHealth["verdict"]);

    // A job that has never been recorded and is healthy needs no row and no
    // noise; only a state change is worth a message.
    const changed = was !== h.verdict;
    const shouldAlert = unhealthy
      ? changed || Boolean(opts.force)
      : wasUnhealthy; // recovery notice, once

    if (!shouldAlert) {
      if (changed && was !== null) {
        await supabaseAdmin
          .from("job_alert_state")
          .upsert({ job: h.job, verdict: h.verdict, reason: h.reason }, { onConflict: "job" });
      }
      continue;
    }

    const kind: "raised" | "recovered" = unhealthy ? "raised" : "recovered";
    const delivery = await deliver(h, kind);
    if (!delivery.delivered) failures += 1;

    const { error: writeError } = await supabaseAdmin.from("job_alert_state").upsert(
      {
        job: h.job,
        verdict: h.verdict,
        reason: h.reason,
        notified_at: new Date().toISOString(),
        channel: delivery.channel,
        delivery_error: delivery.error,
      },
      { onConflict: "job" },
    );
    if (writeError) throw writeError;

    alerts.push({
      job: h.job,
      verdict: h.verdict,
      previous: was,
      kind,
      channel: delivery.channel,
      delivered: delivery.delivered,
      error: delivery.error,
    });
  }

  return {
    checked: health.length,
    unhealthy: health.filter((h) => UNHEALTHY.includes(h.verdict)).length,
    alerts,
    failures,
  };
}
