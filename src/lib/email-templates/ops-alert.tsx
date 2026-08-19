import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * Fallback channel for a scheduled-job alert when no outbound webhook is
 * configured, or the webhook refuses. Fixed recipient: this is an internal
 * operational notice, never something a customer asked for.
 */

export interface OpsAlertProps {
  job?: string
  label?: string
  verdict?: string
  reason?: string
  lastRunAt?: string
}

export function OpsAlertEmail({
  job = 'usage-tick',
  label = 'Usage collection',
  verdict = 'stale',
  reason = 'Last run 3 h ago — past the 15 min this schedule allows.',
  lastRunAt = 'never',
}: OpsAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${label}: ${verdict}`}</Preview>
      <Body style={{ backgroundColor: '#0b0b0f', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ padding: '32px', maxWidth: '560px' }}>
          <Heading style={{ color: '#ffffff', fontSize: '20px', margin: '0 0 8px' }}>
            {verdict === 'recovered' ? 'Recovered' : 'Scheduled job'}: {label}
          </Heading>
          <Text style={{ color: '#a1a1aa', fontSize: '14px', margin: '0 0 16px' }}>
            {job} · {verdict}
          </Text>
          <Section
            style={{ borderTop: '1px solid #27272a', paddingTop: '16px' }}
          >
            <Text style={{ color: '#e4e4e7', fontSize: '15px', margin: '0 0 12px' }}>
              {reason}
            </Text>
            <Text style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>
              Last run: {lastRunAt}
            </Text>
            <Text style={{ color: '#71717a', fontSize: '13px', margin: '12px 0 0' }}>
              Board: /admin/jobs
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OpsAlertEmail,
  subject: (data: Record<string, any>) =>
    `[CostMyAI] ${data['label'] ?? 'Scheduled job'} — ${data['verdict'] ?? 'alert'}`,
  displayName: 'Scheduled job alert',
  to: 'mail@costmyai.com',
  previewData: {
    job: 'usage-tick',
    label: 'Usage collection',
    verdict: 'stale',
    reason: 'Last run 3 h ago — past the 15 min this schedule allows.',
    lastRunAt: '2026-08-19T04:00:00.000Z',
  },
}
