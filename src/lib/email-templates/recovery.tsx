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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your CostMyAI password</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>Reset your password</Heading>

        <Text style={s.text}>
          Use the link below to choose a new password. It works once and expires shortly.
        </Text>

        <Section style={{ margin: '24px 0' }}>
          <Button style={s.button} href={confirmationUrl}>
            Choose a new password
          </Button>
        </Section>

        <Hr style={s.hr} />

        <Text style={s.small}>
          If you didn't ask for this, ignore it — your current password stays exactly as it is.
        </Text>
        <Text style={s.fallback}>Button not working? Paste this into your browser: {confirmationUrl}</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
