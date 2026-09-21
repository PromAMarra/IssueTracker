import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client, for use only in Client Components. Today
 * that means login/signup/logout (supabase.auth.signInWithPassword, etc.) —
 * everything else in the app talks to Supabase from the server. It uses the
 * same public anon key as the server-side clients (lib/supabase/server.ts,
 * lib/supabase/middleware.ts) — the anon key is not a secret and is safe to
 * ship to the browser. Authorization still comes entirely from Postgres RLS
 * evaluated against the caller's session, exactly as on the server; this
 * client carries no elevated privileges.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
