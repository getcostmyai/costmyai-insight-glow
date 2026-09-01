# Newsletter: Monday cadence, real charts, brand design that survives dark mode

Three changes to the weekly issue: the time language, actual graphics inside the email, and a design pass that works in both light and dark inboxes.

## 1. "Last 7 days", never "this week"

The issue goes out every Monday, covering the seven days behind it.

- The composer gets a fixed window label derived from the send date: "1 Sep to 7 Sep 2026", plus a standing subhead line "The last 7 days in AI pricing".
- Copy rule added to project memory so no future draft says "this week", "so far this month" or similar. Phrasing becomes "in the last 7 days" / "over the past seven days".
- The existing saved draft is rewritten to match (its numbers already come from a rolling 7-day query, so only wording changes).
- The data queries behind a draft are pinned to `now() - interval '7 days'` explicitly, so headline and query always agree.

## 2. Graphics that are actually worth looking at

Email clients do not run scripts and mangle inline SVG, so every visual is a real PNG image with a fixed URL. We already have the machinery: the SVG-to-PNG renderer service that powers the Intelligence share images.

A new public image endpoint renders newsletter charts on the same pipeline. Three chart types, chosen because they match what the data keeps saying:

- **Move bars** — the week's biggest price drops as horizontal bars, brand gradient fill, percentage at the end of each bar. This is the "1,052 moves" story in one glance.
- **Spread lollipop** — one model, cheapest host to most expensive host, with the multiple ("14.4x") called out on the connecting rail. Instantly shows how absurd the range is.
- **Quality-per-dollar scatter** — benchmark score on one axis, blended price on a log axis, brand-colored dots, the two or three interesting models labelled. This is the GLM vs Opus story.

In the composer these are written as one-line directives, for example:

```text
::chart kind=bars title="Biggest drops, last 7 days" data="GPT-5.1:-40|Claude cache:-12|Gemini Flash:-9"
```

The numbers live in the directive itself, so the image URL is self-contained and frozen: an issue sent in September still renders the September chart forever, with no database lookup at open time. Every chart carries alt text and a text fallback line beneath it for clients that block images.

## 3. Design pass, light and dark safe

The current issue is plain black-on-white text. It gets brand without becoming a gradient blob:

- Wordmark header with the purple "My", a thin brand rail under it, and a small "Weekly briefing / last 7 days" eyebrow.
- One gradient accent block per issue (the intro stat), in the site's purple-to-coral direction, with white text baked in.
- Section headings get a short brand rule instead of just bigger type. Pull quotes keep the purple left border.
- Footer keeps "Made in Austria" and one-click unsubscribe.

Dark mode is the part that usually breaks, so it is handled explicitly:

- Charts render on their own opaque deep-ink panel with light type, so they read identically on a white or black background. No transparent PNGs, no thin dark lines that vanish.
- The email declares `color-scheme: light dark` and ships a dark-mode media query for clients that honour it (Apple Mail, iOS, Outlook Mac): dark surface, light text, brand purple lightened enough to stay legible on dark.
- Clients that force-invert (Gmail, Outlook Windows) are covered by avoiding pure #fff/#000 pairs and by never putting meaning in a background colour alone.
- Hairlines move to a mid-tone that survives both directions.

## Technical notes

- New: `src/routes/api/public/og/newsletter/chart.png.ts` — public GET, params fully describe the chart, validated with Zod, long cache TTL, PNG only. Falls back to a plain typographic PNG if the renderer is slow, same 3s budget as the share images.
- New: `src/lib/newsletter/chart-svg.server.ts` — builds the three chart SVGs from parsed params, reusing `esc` and `renderSvgToPng` from `src/lib/brand/render.server.ts`.
- `src/lib/newsletter/markdown.ts` — add a `chart` block kind parsed from the `::chart` directive line; unknown kinds degrade to plain text so a typo never blanks the issue.
- `src/lib/email-templates/newsletter-issue.tsx` — render the chart block as `<Img>` with explicit width/height and alt, plus the new header, gradient stat block, and dark-mode styles.
- `src/lib/email-templates/brand.ts` — add dark-safe token variants; existing auth emails keep their current look.
- `src/routes/_authenticated/admin/newsletter.tsx` — composer placeholder text documents the `::chart` directive; the live preview already renders the real template, so charts appear there exactly as sent.
- Tests: markdown directive parsing (valid, malformed, injection attempt), chart param validation, and a render smoke test for each of the three chart kinds.

Nothing about sending changes: Brevo delivery, idempotency, the two-click confirm, and the transactional confirmation email are untouched.
