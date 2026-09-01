import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'
import * as s from './brand'
import {
  chartAltText,
  chartImageUrl,
  chartPixelHeight,
  parseMarkdown,
  previewText,
  CHART_WIDTH,
  type Block,
  type Inline,
} from '@/lib/newsletter/markdown'

/**
 * A weekly issue, sent every Monday about the seven days behind it.
 *
 * The composer writes markdown; this file is the single definition of how that
 * markdown looks in an inbox. The admin preview renders this exact component
 * server-side, so what an editor approves is the same HTML that is sent.
 *
 * Two things it has to survive that a marketing page does not: image blocking,
 * and dark mode. Charts are PNGs with real alt text and a text line under
 * them. Colours avoid pure black-on-white pairs, a `prefers-color-scheme`
 * block covers clients that honour it, and no meaning is ever carried by a
 * background colour alone.
 */

export interface NewsletterIssueProps {
  title?: string
  markdownBody?: string
  unsubscribeUrl?: string
  archiveUrl?: string
  /** Absolute origin the chart images are fetched from. */
  siteOrigin?: string
}

/** Displayed at half the canvas width, so the chart stays crisp on retina. */
const CHART_DISPLAY_WIDTH = 520

const li = { ...s.text, margin: '0 0 8px' }
const quote = {
  ...s.text,
  borderLeft: '3px solid #8B5CF6',
  paddingLeft: '14px',
  color: '#4a4458',
  fontStyle: 'italic' as const,
  margin: '18px 0',
}
const inlineCode = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '13px',
  backgroundColor: '#f4f1fa',
  padding: '1px 5px',
  borderRadius: '4px',
}
const h2 = { ...s.h1, fontSize: '20px', margin: '30px 0 6px' }
const h3 = { ...s.h1, fontSize: '16px', margin: '22px 0 10px' }
/** A short brand rule under a section heading, instead of just bigger type. */
const headingRule = {
  width: '46px',
  height: '3px',
  backgroundColor: '#8B5CF6',
  borderRadius: '2px',
  margin: '0 0 14px',
  fontSize: '1px',
  lineHeight: '1px',
}
const eyebrow = {
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: '#6b6580',
  margin: '0 0 22px',
  fontWeight: 600,
}
const chartFigure = { margin: '22px 0 24px' }
const chartCaption = { ...s.small, fontSize: '12px', margin: '8px 0 0' }

function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, i) => {
        let node: React.ReactNode = span.text
        if (span.code) node = <code style={inlineCode}>{node}</code>
        if (span.bold) node = <strong>{node}</strong>
        if (span.italic) node = <em>{node}</em>
        if (span.href)
          node = (
            <Link key={i} style={s.link} href={span.href}>
              {node}
            </Link>
          )
        return <React.Fragment key={i}>{node}</React.Fragment>
      })}
    </>
  )
}

function Blocks({ blocks, origin }: { blocks: Block[]; origin: string }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'rule') return <Hr key={i} style={s.hr} className="cma-hr" />
        if (block.kind === 'chart') {
          const height = Math.round(
            (chartPixelHeight(block.chart) * CHART_DISPLAY_WIDTH) / CHART_WIDTH,
          )
          return (
            <Section key={i} style={chartFigure}>
              <Img
                src={chartImageUrl(block.chart, origin)}
                alt={chartAltText(block.chart)}
                width={CHART_DISPLAY_WIDTH}
                height={height}
                style={{ width: '100%', maxWidth: `${CHART_DISPLAY_WIDTH}px`, borderRadius: '12px' }}
              />
              {/* The same numbers in words, for anyone whose client blocks images. */}
              <Text style={chartCaption} className="cma-muted">
                {chartAltText(block.chart)}
              </Text>
            </Section>
          )
        }
        if (block.kind === 'quote')
          return (
            <Text key={i} style={quote} className="cma-quote">
              <Spans spans={block.spans} />
            </Text>
          )
        if (block.kind === 'heading') {
          const style = block.level === 3 ? h3 : h2
          return (
            <React.Fragment key={i}>
              <Heading as={block.level === 3 ? 'h3' : 'h2'} style={style} className="cma-text">
                <Spans spans={block.spans} />
              </Heading>
              <div style={headingRule}>&nbsp;</div>
            </React.Fragment>
          )
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i} style={{ margin: '0 0 14px', paddingLeft: '20px' }}>
              {block.items.map((item, j) => (
                <li key={j} style={li} className="cma-text">
                  <Spans spans={item} />
                </li>
              ))}
            </Tag>
          )
        }
        return (
          <Text key={i} style={s.text} className="cma-text">
            <Spans spans={block.spans} />
          </Text>
        )
      })}
    </>
  )
}

/**
 * Dark-mode handling. Apple Mail, iOS Mail and Outlook for Mac honour this;
 * Gmail and Outlook Windows force-invert instead, which is why nothing above
 * uses pure #ffffff / #000000 or relies on a background colour to mean
 * something. The charts are opaque PNGs, so neither path can touch them.
 */
const darkModeCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .cma-body, .cma-container { background-color: #14121a !important; }
    .cma-text, .cma-text * { color: #ece9f5 !important; }
    .cma-muted, .cma-muted * { color: #a79fc4 !important; }
    .cma-quote { color: #cdc6e0 !important; border-left-color: #A78BFA !important; }
    .cma-hr { border-color: #3a3357 !important; }
    .cma-link, .cma-link a, a.cma-link { color: #A78BFA !important; }
    .cma-eyebrow { color: #a79fc4 !important; }
  }
`

const Email = ({
  title = 'The last 7 days in AI spend',
  markdownBody = '',
  unsubscribeUrl = 'https://costmyai.com/newsletter/unsubscribe',
  archiveUrl = 'https://costmyai.com/intelligence',
  siteOrigin = 'https://costmyai.com',
}: NewsletterIssueProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{previewText(markdownBody)}</Preview>
    <Body style={s.main} className="cma-body">
      <Container style={s.container} className="cma-container">
        <Text style={s.brand}>
          Cost<span style={{ color: '#FF6B5A' }}>My</span>AI
        </Text>
        <Text style={eyebrow} className="cma-eyebrow">
          Weekly briefing · the last 7 days
        </Text>

        <Heading style={s.h1} className="cma-text">
          {title}
        </Heading>
        <div
          style={{
            height: '3px',
            width: '100%',
            borderRadius: '2px',
            margin: '4px 0 24px',
            backgroundColor: '#8B5CF6',
            backgroundImage: 'linear-gradient(90deg, #8B5CF6 0%, #FF6B5A 100%)',
            fontSize: '1px',
            lineHeight: '1px',
          }}
        >
          &nbsp;
        </div>

        <Blocks blocks={parseMarkdown(markdownBody)} origin={siteOrigin} />

        <Hr style={s.hr} className="cma-hr" />

        <Text style={s.small} className="cma-muted">
          You are reading the CostMyAI weekly briefing on what AI actually costs, covering the last
          7 days. Measured numbers, no vendor talking points. More at{' '}
          <Link style={s.link} className="cma-link" href={archiveUrl}>
            costmyai.com/intelligence
          </Link>
          .
        </Text>
        <Text style={s.small} className="cma-muted">
          <Link style={s.link} className="cma-link" href={unsubscribeUrl}>
            Unsubscribe
          </Link>{' '}
          in one click. Made in Austria.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => String(data?.['title'] ?? 'CostMyAI weekly briefing'),
  displayName: 'Newsletter issue',
  previewData: {
    title: 'Price moved 1,052 times in the last 7 days. The bigger number is 14.4x.',
    markdownBody:
      '## What moved\n\nThree frontier models repriced in the last 7 days.\n\n::chart kind=bars title="Biggest cuts, last 7 days" data="GPT-5.1:-40|Claude cache reads:-12|Gemini Flash:-9" note="Blended price per million tokens, cheapest active host."\n\n- **GPT-5.1** output down 40%\n- Claude cache reads down 12%\n\n> The invoice does not update itself.\n',
    unsubscribeUrl: 'https://costmyai.com/newsletter/unsubscribe?token=example',
  },
} satisfies TemplateEntry
