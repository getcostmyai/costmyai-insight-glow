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

/**
 * Feedback status notification — sent to the author of a suggestion when the
 * team changes its status or posts an official reply. Transactional: the
 * recipient asked for the thing this email reports on.
 */

export interface FeedbackStatusProps {
  postTitle?: string
  statusLabel?: string
  detail?: string
  postUrl?: string
}

const Email = ({
  postTitle = 'A suggestion',
  statusLabel = 'Planned',
  detail = '',
  postUrl = 'https://www.costmyai.com/feedback',
}: FeedbackStatusProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Your suggestion &ldquo;{postTitle}&rdquo; is now: {statusLabel}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>CostMyAI</Text>

        <Heading style={h1}>Your suggestion moved</Heading>

        <Section style={panel}>
          <Text style={panelLabel}>Suggestion</Text>
          <Text style={panelValue}>{postTitle}</Text>
          <Text style={panelLabel}>New status</Text>
          <Text style={statusValue}>{statusLabel}</Text>
          {detail ? <Text style={panelNote}>{detail}</Text> : null}
        </Section>

        <Text style={text}>
          Follow the thread and see what else is on the board:{' '}
          <Link style={link} href={postUrl}>
            {postUrl}
          </Link>
        </Text>

        <Hr style={hr} />

        <Text style={small}>
          You are receiving this because you posted this suggestion on the CostMyAI feedback
          board. We only email you about your own suggestions.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Your suggestion is now: ${data.statusLabel ?? 'updated'}`,
  displayName: 'Feedback status',
  previewData: {
    postTitle: 'Export the audit trail as CSV',
    statusLabel: 'Planned',
    detail: 'On the list for the next cycle.',
    postUrl: 'https://www.costmyai.com/feedback',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
  color: '#14121a',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const brand = {
  fontSize: '13px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: '#6D34E0',
  fontWeight: 700,
  margin: '0 0 24px',
}
const h1 = { fontSize: '26px', lineHeight: '1.25', margin: '0 0 16px', fontWeight: 600 }
const text = { fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px', color: '#2b2735' }
const panel = {
  border: '1px solid #e7e3f0',
  borderRadius: '14px',
  padding: '18px 20px',
  margin: '22px 0',
}
const panelLabel = {
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#6b6580',
  margin: '0 0 6px',
}
const panelValue = { fontSize: '17px', fontWeight: 600, margin: '0 0 12px', color: '#14121a' }
const statusValue = { fontSize: '20px', fontWeight: 700, margin: '0 0 12px', color: '#6D34E0' }
const panelNote = { fontSize: '13px', lineHeight: '1.5', color: '#6b6580', margin: 0 }
const link = { color: '#6D34E0' }
const hr = { borderColor: '#e7e3f0', margin: '28px 0' }
const small = { fontSize: '13px', lineHeight: '1.6', color: '#6b6580', margin: 0 }
