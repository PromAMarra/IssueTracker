import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

/**
 * Layout for the `(app)` route group — every authenticated screen in the
 * product (root landing page, "new engagement", and everything nested under
 * `[engagementId]/*`) renders inside this. Its only job is the top-level
 * "are you signed in at all" gate; it does NOT know about engagements,
 * roles or phases — those checks live further down (e.g.
 * `[engagementId]/layout.tsx`, and ultimately Postgres RLS).
 *
 * Gotcha: `getSessionUser()` reads the Supabase session from cookies via
 * `createServerClient()` (see lib/supabase/server.ts) and is wrapped in
 * React's `cache()`, so calling it again in a nested layout/page within the
 * same request is free — it does not re-hit Supabase Auth.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  return <>{children}</>;
}
