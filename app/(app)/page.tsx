import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listAccessibleEngagements } from '@/lib/data/engagements';

export default async function RootPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagements = await listAccessibleEngagements();
  if (engagements.length > 0) redirect(`/${engagements[0].id}/board`);
  if (session.profile.is_prometeia) redirect('/new-engagement');

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-lg font-semibold text-ink">No engagement yet</h1>
        <p className="text-sm text-ink-soft">
          Ask your Prometeia contact to add {session.email} to a bank engagement.
        </p>
      </div>
    </main>
  );
}
