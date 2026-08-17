import * as React from 'react'

import {
  Body,
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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your CostMyAI verification code</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>Confirm it's you</Heading>

        <Text style={s.text}>
          Enter this code to confirm your identity and continue.
        </Text>

        <Section style={s.panel}>
          <Text style={s.panelLabel}>Verification code</Text>
          <Text style={s.code}>{token}</Text>
        </Section>

        <Hr style={s.hr} />

        <Text style={s.small}>
          The code expires shortly. If you didn't request it, ignore this email and change your
          password — someone may know it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
