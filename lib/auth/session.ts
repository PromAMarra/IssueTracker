import { cache } from 'react';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Resolves "who is making this request" for Server Components and Server
 * Actions: Supabase Auth's own user record plus the app's `profiles` row
 * (full name, email, and the Prometeia-vs-external `is_prometeia` flag used
 * throughout the app to distinguish internal staff from bank/SIT users).
 *
 * This is a convenience/UX layer only — it decides what to render and gives
 * Server Actions an early, friendly rejection. It is NOT the authorization
 * boundary: every table this session's identity ends up querying is still
 * governed by Postgres RLS using the caller's own session cookies, so a bug
 * here can make the UI behave oddly but cannot by itself grant access to
 * data RLS wouldn't otherwise allow.
 */
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_prometeia: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
};

// Every layout/page/server action in a request calls this independently.
// cache() dedupes those calls to a single Supabase Auth round trip + profile
// query per request instead of re-fetching the same thing 3+ times.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = createServerClient();
  let user;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // All retries (handled inside fetchWithRetry) exhausted — fail closed
    // (treated as signed out) rather than crashing the page.
    return null;
  }
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_prometeia')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // Prefer Supabase Auth's own email (the source of truth, e.g. after the
  // user changes it) over the possibly-stale copy on `profiles`; the
  // profile's email is only a fallback for the unexpected case where Auth
  // doesn't return one.
  return { id: user.id, email: user.email ?? profile.email, profile };
});
