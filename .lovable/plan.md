# LinkedIn company profile rewrite

Rewrite every text field on the CostMyAI LinkedIn page so a non-technical reader (a CFO, a founder, an ops lead) understands what we do in the first two lines. Current copy is written for people who already know the category: "neutral Financial Governance Platform for AI spend", "benchmark that still discriminates", "we refuse to certify a saving". True, but it makes the reader work.

## What changes

Every field gets rewritten, in plain language, in the same voice as the site:

1. **Tagline (220 chars)** — replaces "THE AI Spend Governance Platform: right-sized models, provable savings, automatic switching." Leads with the outcome (you're probably overpaying for AI; we prove it and fix it), not the category name.
2. **Overview / About (2,000 chars)** — restructured so it reads top-down:
   - One line on the problem in the reader's words.
   - One line on what we do about it.
   - The four rungs (Compare, Certify, Rightsize, Govern) as plain sentences, each ending in what the reader gets, not what the system does.
   - Neutrality stated once, simply: no provider pays us, no provider owns us.
   - What it costs and how to start (Compare is free), so the page has a next step.
   - Closing line kept short.
3. **Services description + "Services provided" list** — currently duplicates the About text and the service tags (Financial Analysis, Budgeting, Business Analytics, IT Consulting) read like a consultancy. Rewritten short description plus a recommended tag set that matches a software product.
4. **Specialties / keywords** — a searchable list (AI cost management, LLM pricing, FinOps for AI, model routing, AI spend governance) so the page surfaces in LinkedIn search.
5. **Industry / company details** — a short note on which of the current settings to change (e.g. "Type: Self Employed" reads wrong for a platform vendor) and what to set instead.
6. **Cover image** — recommendation only. The current cover is a plain beige block; we already generate branded 4200 x 700 LinkedIn company covers in the product, so the note points at that spec rather than inventing a new one.

## Claim discipline

Only claims that already hold on the live site get used: 300+ models, 45+ providers, 6-hour sync, Compare free, savings certified against a live benchmark. No invented customer counts, savings percentages, testimonials or logos. "Financial Governance" stays capitalized as the category name but is never the first thing the reader has to parse. No em-dashes.

## Deliverable

A single copy-paste document at `docs/linkedin-profile.md`, one section per LinkedIn field, each with its character budget and the exact text to paste. Nothing in the app changes; this is content for you to paste into LinkedIn.

## Technical notes

Content-only change. One new markdown file under `docs/`. No routes, components, metadata or database touched.
