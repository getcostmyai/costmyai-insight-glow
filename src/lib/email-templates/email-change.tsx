import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import * as s from './brand'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new CostMyAI email address</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>Confirm your new address</Heading>

        <Text style={s.text}>
          You asked to change the address on your CostMyAI account. Confirm it below and the change
          takes effect immediately.
        </Text>

        <Section style={s.panel}>
          <Text style={s.panelLabel}>Current address</Text>
          <Text style={s.panelValue}>{oldEmail}</Text>
          <Text style={s.panelLabel}>New address</Text>
          <Text style={s.panelValue}>{newEmail}</Text>
          <Text style={s.panelNote}>
            After this change, sign in with the new address. If you hold a partner account, tell us
            so we can move it across — partner accounts are linked by exact email.
          </Text>
        </Section>

        <Section style={{ margin: '24px 0' }}>
          <Button style={s.button} href={confirmationUrl}>
            Confirm the change
          </Button>
        </Section>

        <Hr style={s.hr} />

        <Text style={s.small}>
          If you didn't request this, ignore this email and the address stays unchanged.
        </Text>
        <Text style={s.fallback}>Button not working? Paste this into your browser: {confirmationUrl}</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
