import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listAccessibleEngagements } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { engagementId: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, engagements, platformSettings] = await Promise.all([
    getEngagement(params.engagementId),
    listAccessibleEngagements(),
    getPlatformSettings(),
  ]);
  if (!engagement) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header
        profile={session.profile}
        engagements={engagements}
        current={engagement}
        prometeiaLogoUrl={platformSettings.prometeiaLogoUrl}
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          engagementId={engagement.id}
          isProm={session.profile.is_prometeia}
          testCasesEnabled={engagement.test_cases_enabled}
        />
        <main className="min-w-0 flex-1 px-6 py-6">
          <Breadcrumbs engagementId={engagement.id} />
          {children}
        </main>
      </div>
    </div>
  );
}
