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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to a CostMyAI workspace</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>You've been invited</Heading>

        <Text style={s.text}>
          Someone has invited you to their CostMyAI workspace — where their real AI spend, proven
          switches and savings live. Accept below to set up your account.
        </Text>

        <Section style={{ margin: '24px 0' }}>
          <Button style={s.button} href={confirmationUrl}>
            Accept the invitation
          </Button>
        </Section>

        <Hr style={s.hr} />

        <Text style={s.small}>
          Accept using this exact address — an invitation is matched to the address it was sent to.
        </Text>
        <Text style={s.fallback}>Button not working? Paste this into your browser: {confirmationUrl}</Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
