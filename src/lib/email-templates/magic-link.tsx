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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your CostMyAI sign-in link</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>Your sign-in link</Heading>

        <Text style={s.text}>
          Click below to sign in. No password needed. The link works once and expires shortly.
        </Text>

        <Section style={{ margin: '24px 0' }}>
          <Button style={s.button} href={confirmationUrl}>
            Sign in to CostMyAI
          </Button>
        </Section>

        <Hr style={s.hr} />

        <Text style={s.small}>
          If you didn't request this link, ignore this email — nobody can sign in without it.
        </Text>
        <Text style={s.fallback}>Button not working? Paste this into your browser: {confirmationUrl}</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
