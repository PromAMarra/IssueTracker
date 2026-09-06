import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listAccessibleEngagements } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { MinimalHeader } from '@/components/MinimalHeader';

export default async function RootPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagements = await listAccessibleEngagements();
  if (engagements.length > 0) redirect(`/${engagements[0].id}/board`);
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
