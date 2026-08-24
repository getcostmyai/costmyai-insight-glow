# Bilingual site: English + German

Yes, this is doable. The honest picture: the framework part is small, the copy part is large. Today all marketing copy lives inline in the page files (roughly 5,300 lines across the marketing and legal routes), so German is mostly a translation and review effort, not an engineering one. The plan below builds the machinery once, then moves pages over in waves so you can review German copy in batches instead of all at once.

## Decisions locked in

- German lives on its own indexable URLs: `/de`, `/de/pricing`, `/de/how-it-works`, and so on. English keeps today's paths unchanged.
- Scope: marketing pages, legal pages, and emails. The signed-in workspace and admin stay English.
- A first-time visitor with a German browser is sent to the German version once; the choice is remembered in a cookie and can be flipped from a language switcher in the header and footer.
- I draft the German copy in the brand voice (no em-dashes, "Financial Governance" kept as the capitalized proper noun, no serif type), you review and correct it in place.

## How it will work

```text
/pricing        English, canonical
/de/pricing     German, own <title>, own description
                both linked to each other with hreflang
```

Each page becomes one shared component plus two copy files (English and German). The English copy file is filled from the existing page text verbatim, so nothing on the live English site changes wording or layout. The German file is the only new writing.

A visitor's language is resolved in this order: explicit `/de` path, then saved cookie, then browser language, then English. Detection only ever redirects the very first visit, never a shared or crawled URL that already names its language.

## Wave 1 — machinery and the first three pages

- Language context: a small locale resolver, a `cma_lang` cookie, a `useLocale()` hook, and a header/footer language switcher that keeps you on the same page when you flip.
- Locale-aware links so every internal link inside German pages stays German automatically.
- `hreflang` alternate tags plus a per-language canonical on every bilingual page, and both languages listed in the sitemap.
- Move home, pricing and how-it-works to the shared-component plus copy-file shape, and ship German for those three.

## Wave 2 — the rest of the marketing pages

Models, partners, FAQ, about, contact, press, standard, API, tools/LLM price comparison, reports. Same shape, one wave of German copy for your review.

Dynamic content pages (blog posts, Intelligence notes) keep their English article bodies. Their surrounding page chrome becomes German, and each carries a short note that the article itself is in English. Translating individual articles can happen later, one at a time, once you decide which ones deserve it.

## Wave 3 — legal and emails

- Privacy, terms, disclaimer and methodology get German versions. Because these are legal texts, I will mark the German as a convenience translation and keep the English version legally authoritative unless you tell me otherwise. Please confirm.
- Auth and transactional emails pick the recipient's language from their stored preference, defaulting to English. Each template gets a German copy block; the layout and branding are shared.

## Wave 4 — cleanup and verification

- Every German page verified for its own title, description, og:title, og:description, canonical and og:url, per your metadata rule.
- Number, currency and date formatting switched to locale-aware formatting so German shows `1.234,56` and `24. August 2026`. Model names, provider names and product rung names (Compare, Certify, Rightsize, Govern) stay untranslated.
- A check that fails if a German copy key is missing, so a half-translated page cannot ship silently.
- Browser pass over both languages at mobile and desktop widths to catch German text overflowing buttons and nav items, which is the usual breakage since German runs longer than English.

## Technical notes

- Route files under `src/routes/de/` are thin wrappers: they set the locale and render the same page component as their English sibling, so there is one implementation per page, not two.
- Copy lives in `src/lib/i18n/<page>.{en,de}.ts` as typed dictionaries. The German file must satisfy the same type as the English one, so a missing string is a build error rather than a blank spot on the page.
- Detection happens server-side in the root `beforeLoad` off `Accept-Language`, so the correct language is in the first HTML response and there is no flash of English.
- The existing page-view telemetry gains a language field so you can see which language converts.
- No new dependency is needed; the dictionaries and the locale context are a few small files.

## What I need from you

1. Confirm English stays the legally authoritative version for the legal pages.
2. Confirm the German should be informal "du" or formal "Sie". For a finance and governance buyer I would use "Sie" unless you say otherwise.
