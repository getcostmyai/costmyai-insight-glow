import type { ComponentType } from 'react'

import { template as newsletterConfirm } from './newsletter-confirm'
import { template as newsletterIssue } from './newsletter-issue'
import { template as opsAlert } from './ops-alert'
import { template as partnerApplicationAlert } from './partner-application-alert'
import { template as partnerApplicationReceived } from './partner-application-received'
import { template as partnerWelcome } from './partner-welcome'
import { template as feedbackStatus } from './feedback-status'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'partner-welcome': partnerWelcome,
  'ops-alert': opsAlert,
  'newsletter-confirm': newsletterConfirm,
  'newsletter-issue': newsletterIssue,
  'partner-application-alert': partnerApplicationAlert,
  'partner-application-received': partnerApplicationReceived,
  'feedback-status': feedbackStatus,
}
