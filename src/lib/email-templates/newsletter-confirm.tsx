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
 * Newsletter double opt-in.
 *
 * The only job of this mail is to prove the address belongs to the person who
 * typed it. It promises exactly what the list is (one weekly issue about AI
 * spend) and nothing else, and it carries a working unsubscribe link even
 * before confirmation, so a mistyped address has an exit that does not require
 * replying to anyone.
 */

export interface NewsletterConfirmProps {
  confirmUrl?: string
  unsubscribeUrl?: string
  supportEmail?: string
}

const Email = ({
  confirmUrl = 'https://costmyai.com/newsletter/confirm',
  unsubscribeUrl = 'https://costmyai.com/newsletter/unsubscribe',
  supportEmail = 'mail@costmyai.com',
}: NewsletterConfirmProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>One click confirms your weekly AI spend briefing</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>Confirm your subscription</Heading>

        <Text style={s.text}>
          Someone, we hope you, asked for the CostMyAI weekly briefing on what AI actually costs.
          Confirm the address and the next issue arrives on schedule.
        </Text>

        <Section style={{ margin: '26px 0' }}>
          <Link style={s.button} href={confirmUrl}>
            Confirm subscription
          </Link>
        </Section>

        <Section style={s.panel}>
          <Text style={s.panelLabel}>What you get</Text>
          <Text style={s.panelValue}>One issue a week</Text>
          <Text style={s.panelNote}>
            Price moves, model launches and what they do to a real AI bill. Measured numbers, no
            vendor talking points. Leave whenever you like, in one click.
          </Text>
        </Section>

        <Text style={s.small}>
          If the button does not work, paste this into your browser:{' '}
          <Link style={s.link} href={confirmUrl}>
            {confirmUrl}
          </Link>
        </Text>

        <Hr style={s.hr} />

        <Text style={s.small}>
          Did not ask for this? Ignore this email and nothing is sent, or{' '}
          <Link style={s.link} href={unsubscribeUrl}>
            remove the address entirely
          </Link>
          .
        </Text>
        <Text style={s.small}>
          Questions:{' '}
          <Link style={s.link} href={`mailto:${supportEmail}`}>
            {supportEmail}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Confirm your CostMyAI weekly briefing',
  displayName: 'Newsletter confirmation (double opt-in)',
  previewData: {
    confirmUrl: 'https://costmyai.com/newsletter/confirm?token=example',
    unsubscribeUrl: 'https://costmyai.com/newsletter/unsubscribe?token=example',
  },
} satisfies TemplateEntry
