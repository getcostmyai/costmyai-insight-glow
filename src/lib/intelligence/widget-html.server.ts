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
 * Palette is the one already locked for the share images this session
 * (src/lib/intelligence/share-image.server.ts): warm white ground, spend purple
 * accent, saving green for a cut and destructive red for a rise. No new palette
 * is invented here, and no serif ever touches a number.
 */
const PALETTE = {
  bg: "#FAFAFC",
  ink: "#11131D",
  body: "#4B4C57",
  muted: "#70717A",
  hairline: "#E6E6EA",
  brand: "#7945EC",
  up: "#E23439",
  down: "#008C53",
} as const;

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
      radial-gradient(120% 140% at 100% 0%, rgba(121,69,236,.10) 0%, rgba(121,69,236,0) 55%),
      ${PALETTE.bg};
  }
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};font-weight:600}
  .stat{display:flex;flex-direction:column;gap:6px}
  .value{
    font-size:44px;line-height:1;font-weight:700;letter-spacing:-.03em;
    font-variant-numeric:tabular-nums;font-family:${SANS};
  }
  .label{font-size:14px;font-weight:600;letter-spacing:-.01em}
  .detail{font-size:12.5px;line-height:1.45;color:${PALETTE.body}}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;
    border-top:1px solid ${PALETTE.hairline};padding-top:12px}
  .via{font-size:12px;color:${PALETTE.muted};text-decoration:none;font-weight:600;white-space:nowrap}
  .via b{color:${PALETTE.ink};font-weight:700}
  .via i{color:${PALETTE.brand};font-style:normal}
  .dots{display:flex;gap:6px}
  .dot{width:6px;height:6px;border-radius:50%;background:${PALETTE.hairline};transition:background .3s}
  .dot[data-on="1"]{background:${PALETTE.brand}}
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
      <a class="via" id="via" href="${esc(home)}" target="_blank" rel="noopener">via <b>Cost<i>My</i>AI</b></a>
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
