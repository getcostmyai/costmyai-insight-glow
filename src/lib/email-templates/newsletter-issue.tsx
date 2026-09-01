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
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'
import * as s from './brand'
import { parseMarkdown, previewText, type Block, type Inline } from '@/lib/newsletter/markdown'

/**
 * A weekly issue.
 *
 * The composer writes markdown; this file is the single definition of how that
 * markdown looks in an inbox. The admin preview renders this exact component
 * server-side, so what an editor approves is the same HTML that is sent.
 */

export interface NewsletterIssueProps {
  title?: string
  markdownBody?: string
  unsubscribeUrl?: string
  archiveUrl?: string
}

const li = { ...s.text, margin: '0 0 8px' }
const quote = {
  ...s.text,
  borderLeft: '3px solid #6D34E0',
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
const h2 = { ...s.h1, fontSize: '20px', margin: '28px 0 12px' }
const h3 = { ...s.h1, fontSize: '16px', margin: '22px 0 10px' }

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

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'rule') return <Hr key={i} style={s.hr} />
        if (block.kind === 'quote')
          return (
            <Text key={i} style={quote}>
              <Spans spans={block.spans} />
            </Text>
          )
        if (block.kind === 'heading') {
          const style = block.level === 1 ? h2 : block.level === 2 ? h2 : h3
          return (
            <Heading key={i} as={block.level === 3 ? 'h3' : 'h2'} style={style}>
              <Spans spans={block.spans} />
            </Heading>
          )
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i} style={{ margin: '0 0 14px', paddingLeft: '20px' }}>
              {block.items.map((item, j) => (
                <li key={j} style={li}>
                  <Spans spans={item} />
                </li>
              ))}
            </Tag>
          )
        }
        return (
          <Text key={i} style={s.text}>
            <Spans spans={block.spans} />
          </Text>
        )
      })}
    </>
  )
}

const Email = ({
  title = 'This week in AI spend',
  markdownBody = '',
  unsubscribeUrl = 'https://costmyai.com/newsletter/unsubscribe',
  archiveUrl = 'https://costmyai.com/intelligence',
}: NewsletterIssueProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{previewText(markdownBody)}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>CostMyAI</Text>

        <Heading style={s.h1}>{title}</Heading>

        <Blocks blocks={parseMarkdown(markdownBody)} />

        <Hr style={s.hr} />

        <Text style={s.small}>
          You are reading the CostMyAI weekly briefing on what AI actually costs. Measured numbers,
          no vendor talking points. More at{' '}
          <Link style={s.link} href={archiveUrl}>
            costmyai.com/intelligence
          </Link>
          .
        </Text>
        <Text style={s.small}>
          <Link style={s.link} href={unsubscribeUrl}>
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
    title: 'GPT-5.1 dropped 40% and nobody told your finance team',
    markdownBody:
      '## What moved\n\nThree frontier models repriced this week.\n\n- **GPT-5.1** output down 40%\n- Claude cache reads down 12%\n\n> The invoice does not update itself.\n',
    unsubscribeUrl: 'https://costmyai.com/newsletter/unsubscribe?token=example',
  },
} satisfies TemplateEntry
