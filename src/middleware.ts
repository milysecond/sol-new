import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * SEO / host hygiene:
 * - Force apex host (sol.new). www.sol.new had a self-redirect loop and
 *   fragments the index across hosts.
 * - Strip index.html / trailing junk that crawlers invent.
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host")?.toLowerCase() || "";

  // www → apex (preserve path + query)
  if (host === "www.sol.new" || host.startsWith("www.sol.new:")) {
    url.host = "sol.new";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  // Common crawler dead-ends that should never 404 in the report forever
  const path = url.pathname;
  if (path === "/index.html" || path === "/home.html") {
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
  }

  // /link/<code> → same short-link resolver as /l/<code>
  // Keep /link (no segment) as the create-link page.
  const linkAlias = path.match(/^\/link\/([^/]+)(\/opengraph-image)?\/?$/);
  if (linkAlias) {
    const code = linkAlias[1];
    // Don't swallow accidental nested static paths if added later
    if (code && code !== "_next") {
      url.pathname = `/l/${code}${linkAlias[2] || ""}`;
      return NextResponse.rewrite(url);
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
