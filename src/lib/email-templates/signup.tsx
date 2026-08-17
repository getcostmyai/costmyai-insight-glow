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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to finish setting up {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>Confirm your email</Heading>

        <Text style={s.text}>
          You're one click from your workspace. Confirm this address and we'll take you straight
          in.
        </Text>

        <Section style={{ margin: '24px 0' }}>
          <Button style={s.button} href={confirmationUrl}>
            Confirm my email
          </Button>
        </Section>

        <Section style={s.panel}>
          <Text style={s.panelLabel}>Your account address</Text>
          <Text style={s.panelValue}>{recipient}</Text>
          <Text style={s.panelNote}>
            Sign in with this exact address from now on. If you were invited as a partner, this must
            match the address we set your partner account up with.
          </Text>
        </Section>

        <Hr style={s.hr} />

        <Text style={s.small}>
          If you didn't create a CostMyAI account, ignore this email and nothing happens.
        </Text>
        <Text style={s.fallback}>Button not working? Paste this into your browser: {confirmationUrl}</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
