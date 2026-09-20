import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { NewEngagementForm } from '@/components/settings/NewEngagementForm';
import { MinimalHeader } from '@/components/MinimalHeader';
import { getPlatformSettings } from '@/lib/data/settings';

export default async function NewEngagementPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (!session.profile.is_prometeia) redirect('/');

  const platformSettings = await getPlatformSettings();

  return (
    <div className="min-h-screen bg-surface">
      <MinimalHeader prometeiaLogoUrl={platformSettings.prometeiaLogoUrl} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-6 text-xl font-semibold text-ink">New engagement</h1>
        <NewEngagementForm />
      </main>
    </div>
  );
}
