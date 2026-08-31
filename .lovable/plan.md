# Weekly AI Spend Newsletter

Yes to all three: a signup form, stored subscribers you own, and issues we write together.

One important constraint up front: Lovable's built-in email service is for app emails only (confirmations, receipts, alerts). It explicitly refuses newsletters and bulk campaigns, and mixing the two would damage the deliverability of your sign-in and partner mail. So the newsletter sends through Brevo (free up to 300 sends/day, connected as a workspace connector), while `notify.costmyai.com` keeps doing the transactional work it does today. Subscriber data still lives in your own database, not locked inside Brevo.

## On popups

Worth it, but only the restrained kind. A blocking modal on first load hurts a credibility-led site like this. What works here:

- Exit-intent on desktop, and a scroll-past-70% trigger on mobile, on content pages only (`/intelligence`, `/blog`, `/reports`, `/guides`). Never on `/pricing`, `/auth`, `/partners/apply`, or any workspace page.
- Once per visitor, ever. Dismiss is remembered in localStorage and a `cma_nl` cookie; suppressed forever once they subscribe.
- Small bottom-right slide-in card, not a full-screen overlay.

That plus the inline placements below is the whole surface.

## What gets built

**1. Signup surfaces**
- Inline form in the marketing footer (site-wide, one field plus button).
- A prominent block on `/intelligence` under the live cards, where the weekly data already is.
- End-of-article block on blog posts and Intelligence notes.
- The exit-intent slide-in described above.

Each surface passes a `source` tag so you can see which one actually converts.

**2. Storing subscribers (your data)**
New `newsletter_subscribers` table: email, status (`pending`, `confirmed`, `unsubscribed`, `bounced`), source, visitor/session id, referral partner if present, confirm token, timestamps, `is_synthetic`. No public read access; writes go through a rate-limited server function. Double opt-in: subscribing sends a confirmation email, and only a confirmed row ever receives an issue. That is what keeps your sending reputation clean and keeps you GDPR-defensible from Austria.

**3. Writing issues, both ways you asked for**
- `/admin/newsletter`: list issues, create a new one, write in markdown, live-preview it in the real branded email shell, send a test to yourself, then send to all confirmed subscribers. Every issue is stored, so past issues are archived and re-readable.
- Drafting with me in chat: you say "write this week's issue", I pull the actual numbers from your own data (biggest price moves from `price_history`, spread shifts, band winners) and hand you the finished markdown ready to paste into the editor. Optionally I can push the draft straight into the issues table so it is waiting for you in the admin, unsent.

**4. Sending**
Sending runs server-side in batches with per-recipient unsubscribe links, records per-issue send stats, and is idempotent so a retry cannot double-send. Unsubscribe is a one-click public route that flips the row's status. No cron auto-send: nothing goes out without you pressing send.

**5. Public archive (optional, recommended)**
`/newsletter` listing past issues as real pages. It is free SEO on exactly the phrases you already chase, and it gives the signup form something to prove.

## Technical notes

- Migration: `newsletter_subscribers`, `newsletter_issues`, `newsletter_sends`, with GRANTs, RLS (admin-only reads via `is_platform_admin()`, no anon select), append-only send log.
- Signup/confirm/unsubscribe as server functions plus a public route for the token links, all through the existing Postgres rate limiter (`RATE_RULES`).
- Confirmation email is genuinely transactional, so it uses the existing Lovable `sendTemplateEmail` path with a new `newsletter-confirm` template on the shared `brand.ts` styling.
- Issue delivery uses the Brevo connector via the Lovable gateway from a server function; a connect card will appear for you to authorize it.
- Markdown rendered server-side to the same email shell as the preview, so what you see in admin is what ships.
- Telemetry: `newsletter_signup_shown`, `_submitted`, `_confirmed` into `lead_events`, so the funnel joins your existing admin dashboard.
- Route metadata for `/newsletter` and issue pages set as the final step.

## Order of work

1. Migration and RLS.
2. Signup server functions plus confirm/unsubscribe routes and the confirmation email.
3. Footer, Intelligence, and article forms, then the exit-intent card.
4. Admin composer with preview and test-send.
5. Brevo connect plus batch sending.
6. Public archive and metadata.
