import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js Edge middleware entry point (runs before every matched request).
 * All the actual work — session cookie refresh and the signed-out redirect —
 * lives in lib/supabase/middleware.ts (updateSession); this file only wires
 * it up and declares which routes it applies to via `config.matcher` below.
 * Runs in the Edge runtime, so anything it (transitively) imports must be
 * Edge-safe — see lib/supabase/fetchWithRetry.ts vs fetchWithRetryNode.ts.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Excludes Next's own static assets/image optimizer output and the
  // favicon — these are never auth-gated pages and don't need session
  // cookies refreshed on every request. Everything else (all app routes,
  // including API routes) goes through updateSession.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
