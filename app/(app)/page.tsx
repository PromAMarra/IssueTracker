import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listAccessibleEngagements } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { MinimalHeader } from '@/components/MinimalHeader';

/**
 * Landing route at `/` for a signed-in user. It is a router, not a real
 * page: it decides where to send the user next and only falls through to
 * rendering a "no engagement yet" message when there is truly nowhere to
 * send them.
 *
 * `listAccessibleEngagements()` (lib/data/engagements.ts) issues an
 * unfiltered `select` against `engagements` — it relies entirely on
 * Postgres RLS to return only the rows this user is a member of. There is
 * no `WHERE user_id = ...` in application code; if RLS policies on the
 * `engagements`/`engagement_members` tables were ever loosened, this query
 * would start returning engagements the user has no business seeing.
 */
export default async function RootPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagements = await listAccessibleEngagements();
  // Engagements are ordered oldest-first (created_at ascending); "the first
  // one" here is simply this user's earliest engagement, not their "primary"
  // or most-recently-active one — there is no such concept in the data model.
  if (engagements.length > 0) redirect(`/${engagements[0].id}/board`);
  // A Prometeia user with zero engagements can create one themselves; a
  // bank/SIT user cannot (engagement creation is Prometeia-only), so for
  // them there is genuinely nothing to do but show the message below.
  if (session.profile.is_prometeia) redirect('/new-engagement');

  const platformSettings = await getPlatformSettings();

  return (
    <div className="min-h-screen bg-surface">
      <MinimalHeader prometeiaLogoUrl={platformSettings.prometeiaLogoUrl} />
      <main className="flex items-center justify-center px-4 py-20">
        <div className="max-w-sm text-center">
          <h1 className="mb-2 text-lg font-semibold text-ink">No engagement yet</h1>
          <p className="text-sm text-ink-soft">
            Ask your Prometeia contact to add {session.email} to a bank engagement.
          </p>
        </div>
      </main>
    </div>
  );
}
