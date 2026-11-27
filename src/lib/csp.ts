/**
 * Security audit H3: strict CSP + security headers on wallet pages, and no
 * Google Analytics / third-party scripts there.
 *
 * Shared by src/middleware.ts (headers) and src/app/layout.tsx (inline
 * scripts). Inline scripts in the root layout are static strings so the CSP
 * can allow them by SHA-256 hash; Next.js framework scripts get the per-request
 * nonce (wallet routes are rendered dynamically for this).
 */

/** Pages that hold or derive keys, or carry link secrets. */
export const WALLET_PATH_PREFIXES = ["/claim", "/gift", "/ring", "/wallet", "/magic"] as const;

export function isWalletPath(pathname: string): boolean {
  const p = (pathname || "/").toLowerCase();
  return WALLET_PATH_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

// Client-side mirror of isWalletPath (keep in sync with WALLET_PATH_PREFIXES).
// "/" is the wallet (rewritten to /wallet/get) once onboarding is done.
const WALLET_TEST_JS = `function(p){p=(p||"/").toLowerCase();if(p==="/"&&/(?:^|; )sol_new_onboard_done=1/.test(document.cookie))return true;return ${JSON.stringify(
  [...WALLET_PATH_PREFIXES],
)}.some(function(x){return p===x||p.indexOf(x+"/")===0})}`;

/** Deep-link snapshot. Skips secret-bearing URLs' fragment/query (audit H4). */
export const DEEPLINK_SCRIPT = `(function(){try{var p=location.pathname+location.search+location.hash;if(p&&p!=="/"&&p.indexOf("/onboard")!==0){sessionStorage.setItem("solnew.deeplink.entry",p);sessionStorage.setItem("solnew.deeplink.entry.t",String(Date.now()))}}catch(e){}})();`;

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;

export const SW_SCRIPT = `if("serviceWorker"in navigator)window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").then(r=>r.update()).catch(()=>{})})`;

/**
 * GA bootstrap: loads gtag.js only off wallet pages. Sets window.__solnewGa so
 * a soft navigation into a wallet page can hard-reload without GA.
 * The GA ID is read at request time (it is a Worker var/secret, not inlined).
 */
export function gaScript(): string {
  const id = process.env.NEXT_PUBLIC_GA_ID || "";
  if (!id) return "";
  return `(function(){var w=${WALLET_TEST_JS};if(w(location.pathname))return;window.__solnewGa=1;window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',${JSON.stringify(
    id,
  )});var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(${JSON.stringify(
    id,
  )});document.head.appendChild(s)})();`;
}

function inlineScripts(): string[] {
  return [DEEPLINK_SCRIPT, THEME_SCRIPT, SW_SCRIPT, gaScript()].filter(Boolean);
}

const hashCache = new Map<string, string>();

async function sha256B64(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** CSP source expressions for the root layout's inline scripts. */
export async function inlineScriptHashes(): Promise<string[]> {
  return Promise.all(
    inlineScripts().map(async (s) => {
      let h = hashCache.get(s);
      if (!h) {
        h = `'sha256-${await sha256B64(s)}'`;
        hashCache.set(s, h);
      }
      return h;
    }),
  );
}

export function makeNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  return btoa(bin);
}

/** On-ramp SDKs used by /wallet/get (Add cash). Allowed only there. */
const ONRAMP_SCRIPT_HOSTS = [
  "https://js.stripe.com",
  "https://crypto-js.stripe.com",
  "https://api.xramps.moneygram.com",
  "https://playground.xramps.moneygram.com",
];
const ONRAMP_FRAME_HOSTS = [
  "https://js.stripe.com",
  "https://crypto-js.stripe.com",
  "https://*.stripe.com",
  "https://*.moneygram.com",
];

export function buildWalletCsp(pathname: string, nonce: string, hashes: string[]): string {
  const onramp = pathname.toLowerCase().startsWith("/wallet/get");
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    ...hashes,
    "'wasm-unsafe-eval'",
    ...(onramp ? ONRAMP_SCRIPT_HOSTS : []),
  ];
  const frame = ["'self'", ...(onramp ? ONRAMP_FRAME_HOSTS : [])];
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    // Token metadata/images, RPCs and price APIs live on many hosts.
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    `frame-src ${frame.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Extra headers for wallet pages. */
export const WALLET_SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
};

/** Headers for every page response. */
export const SITE_SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
};
