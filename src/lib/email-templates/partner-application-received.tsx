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
 * Applicant acknowledgement.
 *
 * Sent to the address the applicant gave us, on a true first submission only.
 * The copy is fixed: it confirms receipt and restates the one promise the
 * confirmation screen makes — a human reply within 3 business days. It says
 * nothing about approval, tier or timing beyond that, because nothing has been
 * decided at this point and an email that hints otherwise would be a lie the
 * reviewer then has to walk back.
 *
 * No unsubscribe line is written here: Lovable appends its own footer and hosts
 * the unsubscribe page.
 */

export interface PartnerApplicationReceivedProps {
  firstName?: string
  company?: string
  turnaround?: string
  partnerUrl?: string
  supportEmail?: string
}

const Email = ({
  firstName = 'there',
  company = '',
  turnaround = '3 business days',
  partnerUrl = 'https://costmyai.com/partners',
  supportEmail = 'mail@costmyai.com',
}: PartnerApplicationReceivedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We have your partner application — a person replies within {turnaround}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>We have your application</Heading>

        <Text style={s.text}>Hi {firstName},</Text>

        <Text style={s.text}>
          Thanks for applying to the CostMyAI partner program
          {company ? ` on behalf of ${company}` : ''}. Your application is in our review queue.
        </Text>

        <Section style={s.panel}>
          <Text style={s.panelLabel}>What happens next</Text>
          <Text style={s.panelValue}>A reply within {turnaround}</Text>
          <Text style={s.panelNote}>
            A person reads every application — nothing is approved or rejected automatically. You
            do not need to do anything in the meantime, and there is no queue position to check.
          </Text>
        </Section>

        <Text style={s.text}>
          If anything about your practice changes before you hear from us, or you gave us the wrong
          details, just reply to this email and we will update your application.
        </Text>

        <Hr style={s.hr} />

        <Text style={s.small}>
          How the program works, in full:{' '}
          <Link style={s.link} href={partnerUrl}>
            {partnerUrl}
          </Link>
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
  subject: 'We have your CostMyAI partner application',
  displayName: 'Partner application received (applicant)',
  previewData: {
    firstName: 'Jane',
    company: 'Northline Consulting',
    turnaround: '3 business days',
  },
} satisfies TemplateEntry
