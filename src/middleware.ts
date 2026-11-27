import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  buildWalletCsp,
  inlineScriptHashes,
  isWalletPath,
  makeNonce,
  SITE_SECURITY_HEADERS,
  WALLET_SECURITY_HEADERS,
} from "@/lib/csp";

/**
 * SEO / host hygiene + default entry:
 * - Force apex host (sol.new)
 * - `/` rewrites to onboard (default route; URL stays `/`)
 * - Short links, address pretty URLs
 */
export async function middleware(request: NextRequest) {
  const res = await route(request);
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) return res;
  for (const [k, v] of Object.entries(SITE_SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

/**
 * Wallet pages (audit H3): per-request nonce CSP. The CSP is set on the
 * request too, so Next.js stamps the nonce on its own scripts.
 */
async function walletResponse(
  request: NextRequest,
  pathname: string,
  rewriteTo?: URL,
): Promise<NextResponse> {
  const nonce = makeNonce();
  const csp = buildWalletCsp(pathname, nonce, await inlineScriptHashes());
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);
  const res = rewriteTo
    ? NextResponse.rewrite(rewriteTo, { request: { headers: reqHeaders } })
    : NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of Object.entries(WALLET_SECURITY_HEADERS)) res.headers.set(k, v);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

async function route(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host")?.toLowerCase() || "";
  const path = url.pathname;

  // www → apex (preserve path + query)
  if (host === "www.sol.new" || host.startsWith("www.sol.new:")) {
    url.host = "sol.new";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  // Default product entry:
  // - first visit → onboard
  // - finished onboard (cookie) → wallet app (not marketing “Create anything”)
  if (path === "/" || path === "") {
    const done = request.cookies.get("sol_new_onboard_done")?.value === "1";
    url.pathname = done ? "/wallet/get" : "/onboard";
    if (done) return walletResponse(request, url.pathname, url);
    return NextResponse.rewrite(url);
  }

  // Bare /wallet → Get (main wallet content). Avoid empty client-only redirect shell.
  if (path === "/wallet" || path === "/wallet/") {
    url.pathname = "/wallet/get";
    return NextResponse.redirect(url, 308);
  }

  if (isWalletPath(path)) {
    return walletResponse(request, path);
  }

  // Common crawler dead-ends
  if (path === "/index.html" || path === "/home.html") {
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
  }

  // Canonical short links: /link/<code>
  // Legacy /l/<code> → permanent redirect to /link/<code>
  const legacyL = path.match(/^\/l\/([^/]+)(\/opengraph-image)?\/?$/);
  if (legacyL?.[1]) {
    url.pathname = `/link/${legacyL[1]}${legacyL[2] || ""}`;
    return NextResponse.redirect(url, 308);
  }

  // Serve /link/<code> via the existing /l/[code] App Router page (+ OG image)
  // Bare /link stays the create page (no rewrite).
  const linkCode = path.match(/^\/link\/([^/]+)(\/opengraph-image)?\/?$/);
  if (linkCode?.[1] && linkCode[1] !== "_next") {
    url.pathname = `/l/${linkCode[1]}${linkCode[2] || ""}`;
    return NextResponse.rewrite(url);
  }

  // Canonical wallet/token/program lookup: /address/<pubkey>
  // Do NOT rewrite /address → /scan (that steals metadata + confuses crawlers).
  // Scan UI already resolves both /address and /address/<pk> pathnames.
  if (path === "/scan" || path === "/scan/") {
    const q = url.searchParams.get("address") || url.searchParams.get("wallet");
    const dest = request.nextUrl.clone();
    if (q && q.trim()) {
      dest.pathname = `/address/${q.trim()}`;
      dest.search = "";
      return NextResponse.redirect(dest, 308);
    }
    dest.pathname = "/address";
    dest.search = "";
    return NextResponse.redirect(dest, 308);
  }
  if (path === "/address" || path === "/address/") {
    const q = url.searchParams.get("address") || url.searchParams.get("wallet");
    if (q && q.trim()) {
      const dest = request.nextUrl.clone();
      dest.pathname = `/address/${q.trim()}`;
      dest.search = "";
      return NextResponse.redirect(dest, 308);
    }
    return NextResponse.next();
  }
  // /address/<pk> — let the app route handle (metadata + Scan UI). No rewrite.

  // /explorer aliases — Solscan-shaped paths → in-app surfaces
  if (path === "/explorer" || path === "/explorer/") {
    const q =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("address") ||
      url.searchParams.get("tx");
    if (q && q.trim()) {
      const dest = request.nextUrl.clone();
      // leave classification to the page via ?q= — strip other noise
      dest.pathname = "/explorer";
      dest.search = `?q=${encodeURIComponent(q.trim())}`;
      return NextResponse.redirect(dest, 308);
    }
    return NextResponse.next();
  }
  const explorerTx = path.match(/^\/explorer\/(?:tx|transaction)\/([^/]+)\/?$/i);
  if (explorerTx?.[1]) {
    const dest = request.nextUrl.clone();
    dest.pathname = `/receipt/${explorerTx[1]}`;
    dest.search = "";
    return NextResponse.redirect(dest, 308);
  }
  const explorerAddr = path.match(
    /^\/explorer\/(?:address|account|wallet)\/([^/]+)\/?$/i,
  );
  if (explorerAddr?.[1]) {
    const dest = request.nextUrl.clone();
    dest.pathname = `/address/${explorerAddr[1]}`;
    dest.search = "";
    return NextResponse.redirect(dest, 308);
  }
  const explorerToken = path.match(/^\/explorer\/token\/([^/]+)\/?$/i);
  if (explorerToken?.[1]) {
    const dest = request.nextUrl.clone();
    dest.pathname = `/token/${explorerToken[1]}`;
    dest.search = "";
    return NextResponse.redirect(dest, 308);
  }
  // bare /explorer/<value> — pubkey or signature
  const explorerBare = path.match(/^\/explorer\/([^/]+)\/?$/);
  if (explorerBare?.[1] && explorerBare[1] !== "address" && explorerBare[1] !== "tx" && explorerBare[1] !== "token") {
    const v = explorerBare[1];
    const dest = request.nextUrl.clone();
    dest.search = "";
    if (v.length >= 80) {
      dest.pathname = `/receipt/${v}`;
    } else {
      dest.pathname = `/address/${v}`;
    }
    return NextResponse.redirect(dest, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets / Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch|og\\.png|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|wasm)$).*)",
  ],
};
