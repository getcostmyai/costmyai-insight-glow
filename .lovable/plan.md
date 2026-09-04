# Screen recordings: what to show, in what order, and why

Goal of every recording: move a viewer from "my AI bill is rising" to "this thing tells me the truth and I want to see my own number." Desire here does not come from features. It comes from three moments: a number they did not know existed, a refusal that proves we are not selling them a switch, and a one-click action that makes money appear.

## Tooling

Loom is fine and I would keep it for the short pieces: instant link, viewer analytics, no editing tax. Two caveats worth knowing before you record.

- Loom's free tier caps at 5 minutes per video. Everything below is designed under 3 minutes anyway, so that is not a real limit.
- For the flagship 90-second hero video that will sit on the homepage, Loom's chrome (avatar bubble, watermark, player) works against a premium look. Screen Studio (macOS, one-off purchase) gives automatic zoom-on-click, smooth cursor motion and clean 4K export. That "it moves like an Apple keynote" feel is exactly the polish this brand's design standard implies.

Recommendation: Screen Studio for the homepage hero and the pricing-page loops (silent, autoplay, no narration). Loom for everything else, including sales follow-ups and the partner walkthrough.

## The five recordings

### 1. Hero loop, 45 to 60 seconds, silent, autoplays on the homepage
Not a demo. A single visual argument on repeat.

Sequence: live price catalog moving, then one workload row expanding to reveal the same model priced across hosts with a wide spread, then a switch activated and the savings figure counting up. No face, no voice, captions only.

Why: the homepage visitor is deciding in four seconds whether this is real. Motion over a real product beats any hero illustration.

### 2. "The 3-minute tour", 2 to 3 minutes, narrated, on /how-it-works and in every sales email
The main asset. Order matters, and it is deliberately not the order of our plan tiers.

1. **Open on their pain, in the product.** Overview screen: total spend, then the "available" figure right beside it. First line spoken: "This is real money, on real traffic, in the last 30 days." (0:00 to 0:20)
2. **The spread reveal.** Compare level: same model, same weights, different hosts, wide multiple. This is the single most surprising fact we own. Do not rush it. (0:20 to 0:50)
3. **The refusal.** Certify level: show the certified count, then scroll deliberately to "Why some candidates are refused" and read one refusal aloud with its benchmark, score and margin. Say plainly: "We will not certify this one, and here is the measurement that stopped us." (0:50 to 1:35)
4. **The switch.** Activate one workload. Show the SAME MODEL versus CERTIFIED badges, the friction tier, and the rollback control in the same frame. "One click on, one click off." (1:35 to 2:10)
5. **Close on the audit trail.** Govern: an automated decision written down, re-checked at the moment of action. "This is the page you hand to finance." (2:10 to 2:40)

Why this order: steps 1 and 2 create desire, step 3 creates trust, step 4 removes the fear of acting, step 5 makes it defensible to the person who signs off. Most tools skip step 3 and are therefore forgettable. The refusal is the emotional peak of this video, not the savings number.

### 3. "Sixty seconds to first verdict", 60 seconds, on /how-it-works next to the connect step
The setup objection, killed on camera. Run the Verification Engine, change the SDK base URL to point at it, send one request, and show the row appear. Say out loud that the provider key never leaves their environment.

Why: the honest answer to "how hard is this" is worth more than any claim about it, and this is the objection that stalls engineers at exactly the moment they were ready.

### 4. "Read the market for free", 60 to 90 seconds, on /intelligence and attached to every share
Walk the live Intelligence page: price moves in the last 7 days, host spreads, the cheapest model clearing a measured quality band. End on the share control.

Why: this is the top-of-funnel asset. It gives something away, is quotable, and earns links without asking for a signup.

### 5. Partner walkthrough, 2 minutes, gated behind /partners
Referral link, attribution, the commission ledger, the payout. Show that commission is only ever written on a real paid invoice.

Why: partners are selling their own reputation. Showing the ledger mechanics is what makes them comfortable putting their name on it.

## Rules for all of them

- Real data, never a mockup. Use the internal demo workspace, not a slide.
- Never say "Supabase", never show internal IDs, emails, or any real customer's workload names.
- Say the number out loud when it appears on screen. Spoken plus shown lands twice.
- One idea per recording. If a video needs an "and also", it is two videos.
- Every video ends on the same call to action, spoken and on screen: connect and see your own number.
- Recordings age. Anything with a hard figure in it gets re-recorded when the figure stops being true.

## What I would build alongside (optional, ask before I do)

If you want these embedded rather than linked, I can add a lightweight video section to the homepage and /how-it-works that lazy-loads the player so it does not cost page speed, plus `VideoObject` JSON-LD so the videos can surface in search. Say the word and I will plan that separately.
