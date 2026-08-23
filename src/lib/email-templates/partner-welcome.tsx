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
 * Partner welcome / activation email.
 *
 * One template serves both ways a partner account comes into existence: an
 * approved application, and an account created by hand for a partner we already
 * know. Only the opening line differs.
 *
 * The critical fact in this email is the sign-in address. `claim_partner_membership()`
 * links an account to a partner row by exact, confirmed email match, and a
 * mismatch fails silently with nothing shown to the partner. So the address is
 * stated as literal text, prominently, with the confirm-your-email step spelled
 * out and a reply-to-us fallback if the dashboard still looks empty.
 */

export interface PartnerWelcomeProps {
  /** Partner account name, used in the greeting. */
  partnerName?: string
  /** The exact address the partner must sign in with. */
  signInEmail?: string
  referralCode?: string
  referralLink?: string
  loginUrl?: string
  /** true = approved application, false = account created for a known partner. */
  fromApplication?: boolean
  supportEmail?: string
}

const Email = ({
  partnerName = 'there',
  signInEmail = '',
  referralCode = '',
  referralLink = '',
  loginUrl = 'https://costmyai-insight-glow.lovable.app/partner/login',
  fromApplication = false,
  supportEmail = 'mail@costmyai.com',
}: PartnerWelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your CostMyAI partner account is live. Sign in with {signInEmail}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>CostMyAI</Text>

        <Heading style={h1}>Your partner account is live</Heading>

        <Text style={text}>
          {fromApplication
            ? `Hi ${partnerName}, your partner application has been approved and your account is now active.`
            : `Hi ${partnerName}, we have set up a CostMyAI partner account for you and it is active from today.`}
        </Text>

        <Section style={panel}>
          <Text style={panelLabel}>Sign in with this exact address</Text>
          <Text style={panelValue}>{signInEmail}</Text>
          <Text style={panelNote}>
            Your account is linked to this address. Signing up with a different address, even
            another address of yours, will not connect to your partner account and your dashboard
            will look empty.
          </Text>
        </Section>

        <Text style={text}>
          <strong>1.</strong> Go to <Link style={link} href={loginUrl}>{loginUrl}</Link> and create
          your account using {signInEmail}.
        </Text>
        <Text style={text}>
          <strong>2.</strong> Confirm your email address first. We can only link your partner
          account after the address is confirmed, so open the confirmation email before you go
          looking for your dashboard.
        </Text>
        <Text style={text}>
          <strong>3.</strong> Sign in. Your referral code, funnel and commission ledger appear
          automatically.
        </Text>

        {referralCode ? (
          <Section style={panel}>
            <Text style={panelLabel}>Your referral code</Text>
            <Text style={panelValue}>{referralCode}</Text>
            {referralLink ? (
              <>
                <Text style={panelLabel}>Your referral link</Text>
                <Text style={panelValueSmall}>
                  <Link style={link} href={referralLink}>
                    {referralLink}
                  </Link>
                </Text>
              </>
            ) : null}
            <Text style={panelNote}>
              Anyone who signs up after visiting your link is attributed to you for the lifetime of
              their workspace.
            </Text>
          </Section>
        ) : null}

        <Hr style={hr} />

        <Text style={small}>
          If you sign in and the dashboard is empty, do not create a second account. Reply to this
          email or write to{' '}
          <Link style={link} href={`mailto:${supportEmail}`}>
            {supportEmail}
          </Link>{' '}
          and we will link it by hand.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your CostMyAI partner account is live',
  displayName: 'Partner welcome',
  previewData: {
    partnerName: 'Vincent',
    signInEmail: 'vincent@example.com',
    referralCode: 'VINCENT',
    referralLink: 'https://costmyai-insight-glow.lovable.app/r/VINCENT',
    fromApplication: false,
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
const panelValue = {
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 12px',
  color: '#14121a',
  wordBreak: 'break-all' as const,
}
const panelValueSmall = { fontSize: '14px', margin: '0 0 12px', wordBreak: 'break-all' as const }
const panelNote = { fontSize: '13px', lineHeight: '1.5', color: '#6b6580', margin: 0 }
const link = { color: '#6D34E0' }
const hr = { borderColor: '#e7e3f0', margin: '28px 0' }
const small = { fontSize: '13px', lineHeight: '1.6', color: '#6b6580', margin: 0 }
