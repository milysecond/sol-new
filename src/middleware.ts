import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host === "dev.sol.new" || host.startsWith("dev.sol.new:")) {
    return NextResponse.redirect("https://solana-new.pages.dev", { status: 302 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
