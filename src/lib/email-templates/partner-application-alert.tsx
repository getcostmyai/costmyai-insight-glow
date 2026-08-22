import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'
import * as s from './brand'

/**
 * Internal alert: a new partner application has landed.
 *
 * Fixed recipient, following the ops-alert pattern — this is an operational
 * notice to us, never something the applicant asked for. It carries the whole
 * payload deliberately: the promise on the confirmation screen is a human reply
 * within a stated window, and a reviewer should be able to judge the
 * application from the mail itself without opening the queue first.
 *
 * It is a second channel alongside the Slack webhook, not a replacement: if the
 * webhook is unconfigured, rate-limited or silently dropped, this still arrives.
 */

export interface PartnerApplicationAlertProps {
  applicationId?: string
  name?: string
  email?: string
  phone?: string
  company?: string
  activeClients?: string
  startingSoon?: string
  /** Computed reviewer context only — the applicant no longer sees a fork. */
  path?: 'meeting' | 'async'
  escalated?: boolean
  reviewUrl?: string
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={row}>
      <Text style={rowLabel}>{label}</Text>
      <Text style={rowValue}>{value}</Text>
    </Section>
  )
}

const Email = ({
  applicationId = '',
  name = 'Unknown applicant',
  email = '',
  phone = '',
  company = '',
  activeClients = '',
  startingSoon = '',
  path = 'async',
  escalated = false,
  reviewUrl = 'https://costmyai.com/admin/partner-applications',
}: PartnerApplicationAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {company ? `${company} — ${activeClients} active clients` : 'New partner application'}
    </Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>New partner application</Heading>

        <Text style={s.text}>
          {company || 'A new practice'} applied to the partner program. Every application is
          answered by a person within {'3 business days'} — this one is now on the clock.
        </Text>

        <Section style={s.panel}>
          <Row label="Company" value={company || '—'} />
          <Row label="Contact" value={name} />
          <Row label="Email" value={email || '—'} />
          <Row label="Phone" value={phone || '—'} />
          <Row label="Active clients" value={activeClients || '—'} />
          <Row label="Starting in 3 weeks" value={startingSoon || '—'} />
          <Row
            label="Computed routing"
            value={
              path === 'meeting'
                ? escalated
                  ? 'meeting (escalated on near-term pipeline)'
                  : 'meeting (at-scale practice)'
                : 'async review queue'
            }
          />
          <Row label="Application ID" value={applicationId || '—'} />
        </Section>

        <Text style={s.small}>
          Routing is reviewer context only. Every applicant now sees the same confirmation and the
          same review queue — nothing in the product branches on it.
        </Text>

        <Hr style={s.hr} />

        <Text style={s.small}>
          Review it here:{' '}
          <Link style={s.link} href={reviewUrl}>
            {reviewUrl}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data['company']
      ? `New partner application — ${data['company']}`
      : 'New partner application',
  displayName: 'New partner application (internal)',
  to: 'mail@costmyai.com',
  previewData: {
    applicationId: '0d6c1a4e-4f2b-4c33-9f1a-2b6d5e9c7a10',
    name: 'Jane Fischer',
    email: 'jane@northlineconsulting.com',
    phone: '+43 660 1234567',
    company: 'Northline Consulting',
    activeClients: '101–300',
    startingSoon: '3+',
    path: 'meeting',
    escalated: true,
  },
} satisfies TemplateEntry

const row = { margin: '0 0 12px' }

const rowLabel = {
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#6b6580',
  margin: '0 0 2px',
}

const rowValue = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#14121a',
  margin: 0,
  wordBreak: 'break-word' as const,
}
