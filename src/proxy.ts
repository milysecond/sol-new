import { NextResponse, type NextRequest } from 'next/server';
import { notifyEvent } from '@/lib/notify';

const seen = new Map<string, number>();
const VISIT_TTL_MS = 60 * 60 * 1000;

export const config = {
  matcher: ['/((?!api|_next|favicon|robots|sitemap|.*\\.).*)'],
};

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const key = `${ip}:${pathname}`;
  const now = Date.now();
  const last = seen.get(key) ?? 0;
  if (now - last >= VISIT_TTL_MS) {
    seen.set(key, now);
    if (seen.size > 5000) {
      for (const [k, t] of seen) if (now - t > VISIT_TTL_MS) seen.delete(k);
    }
    notifyEvent({
      kind: 'visit',
      emoji: '👀',
      title: `Visit ${pathname}`,
      fields: {
        path: pathname,
        ip,
        ua: req.headers.get('user-agent')?.slice(0, 120) ?? '',
        ref: req.headers.get('referer') ?? '',
      },
    });
  }

  return NextResponse.next();
}
