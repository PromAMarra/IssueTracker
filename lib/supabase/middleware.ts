import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { fetchWithRetry } from './fetchWithRetry';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithRetry },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: User | null = null;
  let checkFailed = false;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // All retries (handled inside fetchWithRetry) exhausted — this runs in
    // the Edge runtime, which can't use the connection-freshness fix the
    // Node.js side (lib/supabase/server.ts) gets, so it's more exposed to
    // this network's dropped connections. We genuinely don't know whether
    // the user is signed in or not here — so let the request through rather
    // than bouncing a signed-in user back to /login on a network blip.
    // Real enforcement is Postgres RLS plus the Node.js-runtime session
    // check in (app)/layout.tsx, which retries this same check more
    // robustly — this is only a UX redirect, not the security boundary.
    checkFailed = true;
  }

  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup');

  if (!user && !isAuthRoute && !checkFailed) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}
