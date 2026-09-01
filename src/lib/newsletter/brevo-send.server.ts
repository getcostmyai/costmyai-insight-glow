import * as React from 'react'
import { render } from '@react-email/render'
import { template } from '@/lib/email-templates/newsletter-issue'

// Server-only: reads LOVABLE_API_KEY and BREVO_API_KEY.

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/brevo'
const SITE_NAME = 'CostMyAI'
// This subdomain must be authenticated in the linked Brevo account.
// It MUST NOT be notify.costmyai.com, which is delegated to Lovable's
// transactional-email nameservers.
const SENDER_DOMAIN = process.env['BREVO_SENDER_DOMAIN'] || 'news.costmyai.com'
const FROM_DOMAIN = process.env['BREVO_FROM_DOMAIN'] || 'news.costmyai.com'

export type SendBrevoNewsletterResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendBrevoNewsletterOptions {
  title: string
  markdownBody: string
  unsubscribeUrl: string
  archiveUrl: string
  /** Absolute origin the chart images are fetched from. */
  siteOrigin: string
  idempotencyKey: string
}

/**
 * Renders the newsletter-issue template and sends it through Brevo via the
 * Lovable connector gateway. Suppressed/blocklisted recipients are an expected
 * outcome ({ sent: false }); any other failure throws.
 */
export async function sendBrevoNewsletter(
  to: string,
  options: SendBrevoNewsletterOptions,
): Promise<SendBrevoNewsletterResult> {
  const lovableApiKey = process.env['LOVABLE_API_KEY']
  if (!lovableApiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }

  const brevoApiKey = process.env['BREVO_API_KEY']
  if (!brevoApiKey) {
    throw new Error('BREVO_API_KEY is not configured')
  }

  const templateData = {
    title: options.title,
    markdownBody: options.markdownBody,
    unsubscribeUrl: options.unsubscribeUrl,
    archiveUrl: options.archiveUrl,
    siteOrigin: options.siteOrigin,
  }

  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })

  const response = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': brevoApiKey,
    },
    body: JSON.stringify({
      sender: { name: SITE_NAME, email: `noreply@${FROM_DOMAIN}` },
      sender_domain: SENDER_DOMAIN,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      tags: [options.idempotencyKey],
    }),
  })

  if (response.ok) {
    return { sent: true }
  }

  const errorBody = await response.text()
  const lower = errorBody.toLowerCase()

  // Brevo rejects blocklisted, unsubscribed, or malformed recipients with
  // 400-class responses. Treat those as settled outcomes so they do not retry.
  if (
    lower.includes('blocklist') ||
    lower.includes('blacklist') ||
    lower.includes('suppressed') ||
    lower.includes('unsubscribed') ||
    lower.includes('invalid_email') ||
    lower.includes('invalid contact')
  ) {
    return { sent: false, reason: 'recipient_suppressed' }
  }

  throw new Error(`Brevo send failed [${response.status}]: ${errorBody}`)
}
