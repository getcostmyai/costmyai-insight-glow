# Add LinkedIn and Instagram social icons

## Placement recommendation

Primary placement: **footer brand column**, directly below the tagline. The brand column currently has the wordmark + one-line description and otherwise ends; social follow links belong there because they are low-friction, expected, and do not compete with the main CTA.

Secondary placement (optional): **Contact page** (`/contact`), in the "Email" row area or as a small row below the based-in line. This gives people who land on Contact another way to connect.

Avoid: the top navigation — it is already crowded with "Book a Demo" + "Start free" + account icon, and social icons would dilute conversion focus.

## Implementation

1. In `src/components/marketing/MarketingShell.tsx`:
   - Add an icon row under the tagline in the brand column.
   - Use `lucide-react` `Linkedin` for LinkedIn.
   - Use a small inline Instagram SVG logomark (no official lucide icon) to keep it consistent with the XMark pattern already used in `BlogShareButton.tsx`.
   - Links: `https://www.linkedin.com/company/costmyai` and `https://www.instagram.com/costmyai`.
   - Each link: `target="_blank"`, `rel="noreferrer noopener"`, `aria-label`.
   - Style: `h-5 w-5` icons, muted-foreground color, hover to foreground, with a small gap.

2. Optional in `src/routes/contact.tsx`:
   - Add a "Social" row in the contact list with the same two icons and URLs.

## Acceptance

- Footer renders the two icons on every marketing page.
- Icons are keyboard-accessible and open in a new tab safely.
- No layout breakage on mobile; icons sit cleanly inside the brand column width.
- `npx tsc --noEmit` remains clean.
