/**
 * Shared brand styling for CostMyAI emails.
 *
 * These values mirror partner-welcome.tsx exactly so every message the product
 * sends — auth or transactional — reads as the same product. The Body
 * background stays white regardless of the app's dark theme; email clients
 * handle dark backgrounds badly and auth mail is load-bearing.
 */

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
  color: '#14121a',
}

export const container = { padding: '32px 28px', maxWidth: '560px' }

export const brand = {
  fontSize: '13px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: '#6D34E0',
  fontWeight: 700,
  margin: '0 0 24px',
}

export const h1 = {
  fontSize: '26px',
  lineHeight: '1.25',
  margin: '0 0 16px',
  fontWeight: 600,
}

export const text = {
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 14px',
  color: '#2b2735',
}

export const panel = {
  border: '1px solid #e7e3f0',
  borderRadius: '14px',
  padding: '18px 20px',
  margin: '22px 0',
}

export const panelLabel = {
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#6b6580',
  margin: '0 0 6px',
}

export const panelValue = {
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 12px',
  color: '#14121a',
  wordBreak: 'break-all' as const,
}

export const panelNote = {
  fontSize: '13px',
  lineHeight: '1.5',
  color: '#6b6580',
  margin: 0,
}

export const button = {
  backgroundColor: '#6D34E0',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  borderRadius: '10px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const link = { color: '#6D34E0' }

export const hr = { borderColor: '#e7e3f0', margin: '28px 0' }

export const small = {
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#6b6580',
  margin: 0,
}

/** Raw-URL fallback line, for clients that strip buttons. */
export const fallback = {
  fontSize: '12px',
  lineHeight: '1.5',
  color: '#6b6580',
  margin: '18px 0 0',
  wordBreak: 'break-all' as const,
}

export const code = {
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '0.18em',
  margin: '0',
  color: '#14121a',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
