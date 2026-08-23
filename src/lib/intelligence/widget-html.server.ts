import { WIDGET_CACHE_TTL_MS, WIDGET_ROTATE_MS, type WidgetPayload } from "./widget.server";

/**
 * The embeddable widget document.
 *
 * Delivered as a standalone HTML document served in an <iframe>, never as a
 * <script> tag that would execute inside the host page's origin. That is the
 * whole security posture of this surface: whatever we render, and whatever the
 * host page runs, stay in separate browsing contexts. Nothing from the embedder
 * — no query string, no postMessage, no attribute — selects or labels content;
 * the rotation set is fixed server-side.
 *
 * Palette follows the site-wide marketing standard: warm white ground, the wide
 * brand gradient (indigo through amber) used for the "My" of the wordmark and
 * for the mesh wash, saving green for a cut and destructive red for a rise. No
 * new palette is invented here, and no serif ever touches a number.
 */
const PALETTE = {
  bg: "#FAFAFC",
  ink: "#11131D",
  body: "#4B4C57",
  muted: "#70717A",
  hairline: "#E6E6EA",
  brand: "#7C3AED",
  indigo: "#6366F1",
  violet: "#7C3AED",
  magenta: "#C03CC8",
  coral: "#FB715C",
  amber: "#FBB059",
  up: "#E23439",
  down: "#008C53",
} as const;

/** The wide brand gradient, identical in intent to --gradient-brand-wide. */
const GRADIENT_WIDE = `linear-gradient(100deg, ${PALETTE.indigo} 0%, ${PALETTE.violet} 34%, ${PALETTE.magenta} 62%, ${PALETTE.coral} 88%, ${PALETTE.amber} 100%)`;

/** The mesh wash, flattened to static radials for a document with no tokens. */
const MESH = `radial-gradient(78% 108% at 8% -10%, rgba(99,102,241,.28) 0%, rgba(99,102,241,0) 72%),
      radial-gradient(62% 92% at 102% 4%, rgba(192,60,200,.20) 0%, rgba(192,60,200,0) 70%),
      radial-gradient(58% 86% at 88% 108%, rgba(251,113,92,.14) 0%, rgba(251,113,92,0) 74%)`;

const SANS =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";


/** Every dynamic string goes through this before it reaches the document. */
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Safe JSON island: `<` can never open a tag, so no script-break injection. */
const jsonIsland = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");

/**
 * Absolute UTC, not "3 minutes ago": the document is served from a cache with a
 * TTL, so a relative label baked into the HTML would itself go stale in the
 * embedder's cache and lie about how stale the figures are.
 */
export function asOfLabel(computedAt: number): string {
  const d = new Date(computedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}


export interface WidgetDocOptions {
  /** Absolute URL of this app, used for the attribution link only. */
  origin: string;
  nonce: string;
}

export function renderWidgetDocument(payload: WidgetPayload, opts: WidgetDocOptions): string {
  const { origin, nonce } = opts;
  const home = `${origin}/intelligence?utm_source=embed&utm_medium=widget`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>AI price market — via CostMyAI</title>
<style nonce="${nonce}">
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    font-family:${SANS};
    background:${PALETTE.bg};
    color:${PALETTE.ink};
    -webkit-font-smoothing:antialiased;
  }
  .card{
    position:relative;height:100%;min-height:168px;display:flex;flex-direction:column;
    justify-content:space-between;gap:14px;padding:20px 22px;overflow:hidden;
    border:1px solid ${PALETTE.hairline};border-radius:18px;
    background:
      ${MESH},
      ${PALETTE.bg};
  }
  /* Hairline rail in brand, the marketing pages' one accent stroke. */
  .card::before{
    content:"";position:absolute;left:0;right:0;top:0;height:2px;
    background:${GRADIENT_WIDE};opacity:.9;
  }
  .asof{font-size:11px;color:${PALETTE.muted};white-space:nowrap}
  .asof[data-stale="1"]{color:${PALETTE.up};font-weight:600}
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};font-weight:600}
  .stat{display:flex;flex-direction:column;gap:6px}
  .value{
    font-size:46px;line-height:1;font-weight:700;letter-spacing:-.035em;
    font-variant-numeric:tabular-nums;font-family:${SANS};
  }
  .label{font-size:14px;font-weight:600;letter-spacing:-.01em}
  .detail{font-size:12.5px;line-height:1.45;color:${PALETTE.body}}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;
    border-top:1px solid ${PALETTE.hairline};padding-top:12px}
  .via{font-size:12px;color:${PALETTE.muted};text-decoration:none;font-weight:600;white-space:nowrap}
  .via b{color:${PALETTE.ink};font-weight:700;letter-spacing:-.01em}
  /* "My" carries the wide brand gradient, exactly as the site wordmark does. */
  .via i{
    font-style:normal;background-image:${GRADIENT_WIDE};
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  .dots{display:flex;gap:6px}
  .dot{width:6px;height:6px;border-radius:50%;background:${PALETTE.hairline};transition:background .3s}
  .dot[data-on="1"]{background:${PALETTE.violet}}

  .fade{opacity:0;transform:translateY(6px);transition:opacity .45s ease,transform .45s ease}
  .fade[data-in="1"]{opacity:1;transform:none}
  @media (prefers-reduced-motion: reduce){.fade{transition:none}}
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">AI price market · ${esc(payload.month)}</div>
    <div class="stat fade" id="stat" data-in="1">
      <div class="value" id="value"></div>
      <div class="label" id="label"></div>
      <div class="detail" id="detail"></div>
    </div>
    <div class="foot">
      <div class="dots" id="dots"></div>
      <!-- The age of the figures, stated on the surface that carries them.
           A widget nobody at CostMyAI can see has to disclose its own
           staleness or nothing will. -->
      <span class="asof" id="asof" data-stale="${payload.stale ? "1" : "0"}">${esc(
        payload.stale
          ? `Last refreshed ${asOfLabel(payload.computedAt)} · retrying`
          : `As of ${asOfLabel(payload.computedAt)}`,
      )}</span>
      <a class="via" id="via" href="${esc(home)}" target="_blank" rel="noopener">Powered by <b>Cost<i>My</i>AI</b></a>
    </div>
  </div>
<script nonce="${nonce}">
(function(){
  var TONES={brand:"${PALETTE.brand}",up:"${PALETTE.up}",down:"${PALETTE.down}"};
  var state=${jsonIsland(payload.stats)};
  var i=0;
  var stat=document.getElementById("stat");
  var value=document.getElementById("value");
  var label=document.getElementById("label");
  var detail=document.getElementById("detail");
  var dots=document.getElementById("dots");

  function drawDots(){
    dots.innerHTML="";
    for(var d=0;d<state.length;d++){
      var el=document.createElement("span");
      el.className="dot";
      el.setAttribute("data-on", d===i?"1":"0");
      dots.appendChild(el);
    }
  }
  function draw(){
    var s=state[i]; if(!s) return;
    value.textContent=s.value;
    value.style.color=TONES[s.tone]||TONES.brand;
    label.textContent=s.label;
    detail.textContent=s.detail;
    document.body.setAttribute("data-stat", s.id);
    drawDots();
  }
  function advance(){
    if(state.length<2){draw();return;}
    stat.setAttribute("data-in","0");
    setTimeout(function(){ i=(i+1)%state.length; draw(); stat.setAttribute("data-in","1"); },260);
  }
  draw();
  setInterval(advance, ${WIDGET_ROTATE_MS});

  // Refresh from our own origin only (CSP connect-src 'self'), on the same
  // cadence as the server cache — a long-lived embed cannot poll faster.
  setInterval(function(){
    fetch("/api/public/widget/intelligence",{headers:{accept:"application/json"}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){ if(j&&Array.isArray(j.stats)&&j.stats.length){ state=j.stats; if(i>=state.length)i=0; draw(); } })
      .catch(function(){});
  }, ${WIDGET_CACHE_TTL_MS});
})();
</script>
</body>
</html>`;
}

/**
 * Headers for the widget document.
 *
 * `frame-ancestors *` is the one deliberately wide directive, and it is scoped
 * to this single route: embedding on arbitrary third-party pages IS the product
 * here. Everything else is clamped — `default-src 'none'` means the document may
 * load nothing at all beyond what is named, scripts and styles run only under
 * the per-response nonce (no `unsafe-inline`), outbound calls are `'self'` so
 * the widget can never talk to a third party, and `base-uri`/`form-action` are
 * denied outright. No other route in the app relaxes frame-ancestors.
 */
export function widgetDocumentHeaders(nonce: string): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "frame-ancestors *",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    // Public, non-personalised, and identical for every embedder.
    "Cache-Control": `public, max-age=${Math.floor(WIDGET_CACHE_TTL_MS / 1000)}, s-maxage=${Math.floor(
      WIDGET_CACHE_TTL_MS / 1000,
    )}`,
  };
}

/**
 * What the widget shows when there are no figures it can honestly present.
 *
 * Deliberately blank of numbers. The failure mode this replaces — quietly
 * re-serving a cached market long after the refresh stopped working — is worse
 * than showing nothing, because a third-party page has no way to tell.
 */
export function renderWidgetUnavailable(opts: WidgetDocOptions): string {
  const { origin, nonce } = opts;
  const home = `${origin}/intelligence?utm_source=embed&utm_medium=widget`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>AI price market — via CostMyAI</title>
<style nonce="${nonce}">
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:${SANS};background:${PALETTE.bg};color:${PALETTE.ink};-webkit-font-smoothing:antialiased}
  .card{position:relative;height:100%;min-height:168px;display:flex;flex-direction:column;
    justify-content:space-between;gap:14px;padding:20px 22px;overflow:hidden;
    border:1px solid ${PALETTE.hairline};border-radius:18px;background:${PALETTE.bg}}
  .card::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;
    background:${GRADIENT_WIDE};opacity:.55}
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};font-weight:600}
  .label{font-size:16px;font-weight:600;letter-spacing:-.01em}
  .detail{font-size:12.5px;line-height:1.45;color:${PALETTE.body};margin-top:6px}
  .foot{display:flex;align-items:center;justify-content:flex-end;
    border-top:1px solid ${PALETTE.hairline};padding-top:12px}
  .via{font-size:12px;color:${PALETTE.muted};text-decoration:none;font-weight:600}
  .via b{color:${PALETTE.ink};font-weight:700;letter-spacing:-.01em}
  .via i{font-style:normal;background-image:${GRADIENT_WIDE};
    -webkit-background-clip:text;background-clip:text;color:transparent}

</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">AI price market</div>
    <div>
      <div class="label">Figures temporarily unavailable</div>
      <div class="detail">We would rather show nothing than show a market reading we cannot confirm is current. Live figures at CostMyAI.</div>
    </div>
    <div class="foot">
      <a class="via" href="${esc(home)}" target="_blank" rel="noopener">Powered by <b>Cost<i>My</i>AI</b></a>
    </div>
  </div>
</body>
</html>`;
}
