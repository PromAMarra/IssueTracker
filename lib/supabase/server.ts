import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchWithRetryNode } from './fetchWithRetryNode';

/**
 * The Supabase client used by (almost) every Server Component and every
 * Server Action in app/actions/*.ts. It is built with the anon key plus the
 * current request's session cookies — NOT a service-role/admin key — so
 * every query issued through this client is evaluated by Postgres RLS as
 * the signed-in caller. This is the linchpin of the whole "RLS is the real
 * authorization boundary" architecture described across app/actions/*.ts:
 * Server Actions' own JS-level role/permission checks are UX only, and it
 * is this client's identity that Postgres actually enforces against.
 *
 * Uses fetchWithRetryNode (not the plain fetch) to work around this
 * environment's dead-connection-reuse issue — see that file for details.
 */
export function createServerClient() {
  const cookieStore = cookies();
  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithRetryNode },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component; middleware refreshes the session instead
          }
        },
      },
    },
  );
}
