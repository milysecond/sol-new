import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * SEO / host hygiene + default entry:
 * - Force apex host (sol.new)
 * - `/` rewrites to onboard (default route; URL stays `/`)
 * - Short links, address pretty URLs
 */
export function middleware(request: NextRequest) {
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
    return NextResponse.rewrite(url);
  }

  // Bare /wallet → Get (main wallet content). Avoid empty client-only redirect shell.
  if (path === "/wallet" || path === "/wallet/") {
    url.pathname = "/wallet/get";
    return NextResponse.redirect(url, 308);
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
