'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Sign-out control used in both the full `Header` and `MinimalHeader`.
 *
 * Responsibility: clears the Supabase Auth session (which also drops the
 * session cookies that every Server Action relies on for RLS-based
 * authorization) and sends the user back to `/login`.
 *
 * Gotcha: `router.refresh()` after `router.push('/login')` is required —
 * without it, Next.js Router Cache can keep serving cached RSC payloads for
 * the previous (authenticated) route tree, so stale, session-gated content
 * could briefly flash even though the cookie is already gone.
 */
export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    // Order matters: sign out (invalidate session cookies) before navigating,
    // so nothing in-flight can slip through using the about-to-expire session.
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-ink-soft hover:text-ink hover:underline"
    >
      Sign out
    </button>
  );
}
