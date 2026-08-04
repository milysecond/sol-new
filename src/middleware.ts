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

  // Default product entry: onboarding (URL stays `/`)
  if (path === "/" || path === "") {
    url.pathname = "/onboard";
    return NextResponse.rewrite(url);
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
  // Bare /address → scan form. Query ?address= still works via /scan.
  if (path === "/address" || path === "/address/") {
    url.pathname = "/scan";
    return NextResponse.rewrite(url);
  }
  const addressLookup = path.match(/^\/address\/([^/]+)\/?$/);
  if (addressLookup?.[1]) {
    let addr = addressLookup[1];
    try {
      addr = decodeURIComponent(addr);
    } catch {
      /* keep raw */
    }
    url.pathname = "/scan";
    url.searchParams.set("address", addr);
    return NextResponse.rewrite(url);
  }

  // Legacy: /scan?address=X → pretty /address/X (shareable)
  if (path === "/scan" || path === "/scan/") {
    const q = url.searchParams.get("address") || url.searchParams.get("wallet");
    if (q && q.trim()) {
      const dest = request.nextUrl.clone();
      dest.pathname = `/address/${encodeURIComponent(q.trim())}`;
      dest.search = "";
      return NextResponse.redirect(dest, 308);
    }
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
