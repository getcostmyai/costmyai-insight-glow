# CostMyAI German Public-Surface Translation

Translate the entire public-facing surface of CostMyAI into German, while leaving all authenticated product UI in English only. English stays the legally binding language; German is a convenience layer.

## Scope: public surface only (IN)

- All marketing routes: `/`, `/pricing`, `/how-it-works`, `/models`, `/about`, `/contact`, `/press`, `/standard`, `/partners`, `/faq`, `/intelligence`, `/tools/*`, `/guides/*`, `/estimator`
- Public conversion routes: `/auth`, `/auth/callback`, `/login`, `/signup`, password-reset, and any other unauthenticated entry screens
- Public/legal routes: `/privacy`, `/terms`, `/imprint` (or equivalent), `/cookies`
- Public error surfaces: 404 / not-found copy, public error messages
- Transactional emails sent from the platform (welcome, partner-apply receipts, password reset, etc.)
- SEO metadata (title, description, og:*, JSON-LD where translatable) for every public route
- Public navigation, footer, CTAs, and shared marketing shell copy
- Public sitemap and hreflang annotations

## Scope: authenticated product (OUT)

- Dashboard (`/dashboard/*`)
- Admin command center (`/admin/*`)
- Partner portal and partner dashboard
- Billing, subscription, checkout, and plan-management screens
- Authenticated settings / profile / organization management
- In-product tooltips, empty states, and authenticated error messages inside the app
- Any copy inside server functions, API responses, or database-backed messages that are not user-facing emails

## URL strategy

- German pages live under `/de/*`.
- Default language remains English at the root paths (`/*`).
- `__root.tsx` detects `Accept-Language` / an `i18n` cookie on first visit and offers a soft banner; it never auto-redirects a crawler.
- Every public route gets a German sibling under `src/routes/de/...` using the same filename conventions.
- `hreflang` alternate links are emitted for every public route pair (`x-default`, `en`, `de`).
- Canonical points to the current language version; `og:locale` matches.

## Technical approach

1. **Infra**
   - Add `src/lib/i18n/` with per-page typed copy files: `{page}.en.ts` and `{page}.de.ts`.
   - Add a lightweight `useI18n()` hook and a `I18nProvider` scoped to public routes.
   - Add a cookie-backed language resolver in `__root.tsx` that only runs client-side for state, and SSR-safe defaults for crawlers.

2. **Wave 1 — Core conversion**
   - Home (`/`, `/de/`)
   - Pricing (`/pricing`, `/de/preise` or `/de/pricing`)
   - How it Works (`/how-it-works`, `/de/so-funktioniert-es`)
   - Auth entry screens (`/login`, `/signup`, `/de/anmelden`, `/de/registrieren`)
   - Marketing shell, footer, and navigation

3. **Wave 2 — Marketing depth**
   - Models, About, Contact, Press, Standard, Partners, FAQ, Intelligence
   - Tools and Guides routes
   - Estimator

4. **Wave 3 — Legal and emails**
   - Privacy, Terms, Cookie policy, Imprint
   - Transactional email templates (plain-text + HTML where applicable)

5. **Wave 4 — SEO and polish**
   - Translate route metadata
   - Add hreflang / alternate links
   - Update sitemap generator to include `/de/*` URLs
   - Number/date formatting stays deterministic and German-aware only where it improves readability; currency formatting remains USD/EUR business logic unchanged
   - UI overflow checks on mobile for German longer copy

## Voice and formality

- German uses formal "Sie" for all user-facing copy.
- Tone stays punchy, plain, and outcome-focused — same as English.
- No em-dashes in German copy either.
- "Financial Governance" remains capitalized as a proper noun in English; German equivalent is chosen once and used consistently.

## Deliverables

- German route tree under `src/routes/de/`
- `src/lib/i18n/` copy files and resolver
- Updated `__root.tsx` with language detection and hreflang support
- Updated `src/routes/sitemap.xml.ts` to include German URLs
- Translated transactional email templates
- No changes to authenticated product routes, dashboards, or admin surfaces

## Success check

- Every public URL has a working `/de/*` counterpart.
- Switching language updates copy without full-page reload and persists in a cookie.
- Authenticated routes remain English-only and unaffected.
