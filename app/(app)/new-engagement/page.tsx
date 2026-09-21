import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { NewEngagementForm } from '@/components/settings/NewEngagementForm';
import { MinimalHeader } from '@/components/MinimalHeader';
import { getPlatformSettings } from '@/lib/data/settings';

/**
 * `/new-engagement` — the form Prometeia staff use to spin up a brand-new
 * bank/client engagement. The actual insert (and default membership wiring)
 * happens in the `NewEngagementForm` client component's server action, not
 * here; this page only gates access and supplies the Prometeia-branding
 * chrome shown before an engagement (and therefore a bank logo) exists yet.
 *
 * Access is Prometeia-only. This is a page-level UX guard — the real
 * enforcement is the RLS INSERT policy on `engagements`, which the
 * underlying server action's Supabase call is still subject to even if this
 * redirect were ever bypassed.
 */
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
