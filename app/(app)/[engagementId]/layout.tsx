import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listAccessibleEngagements } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { listTestPackageNames } from '@/app/actions/testPackages';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

/**
 * Layout for every route nested under `[engagementId]/*` (board, list,
 * dashboard, settings, testing-lab). Responsible for: re-checking auth,
 * resolving the `:engagementId` route param to a real engagement (404-ing
 * if not), and rendering the shared chrome (Header, Sidebar, Breadcrumbs)
 * that every child page sits inside.
 *
 * Critical gotcha (shared with every page below it): `getEngagement(id)`
 * does a plain `.eq('id', id).maybeSingle()` with no explicit membership
 * check in application code. Postgres RLS on the `engagements` table is
 * what actually prevents a signed-in user from loading an engagement they
 * are not a member of — for such a user this query legitimately comes back
 * empty, which is indistinguishable here from the id simply not existing,
 * and both cases resolve to `notFound()`. Do not "fix" this by assuming a
 * non-null result implies authorization elsewhere; the guarantee comes from
 * RLS, not from this code.
 *
 * `listTestPackageNames` is only fetched when `test_cases_enabled` is on
 * for this engagement, since the Sidebar only shows the Testing Lab
 * package list in that case — this avoids an unnecessary query otherwise.
 */
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

  // Sidebar only renders the test-package list when this engagement tracks
  // test cases at all — skip the query entirely otherwise.
  const testPackages = engagement.test_cases_enabled ? await listTestPackageNames(engagement.id) : [];

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
          testPackages={testPackages}
        />
        <main className="min-w-0 flex-1 px-6 py-6">
          <Breadcrumbs engagementId={engagement.id} />
          {children}
        </main>
      </div>
    </div>
  );
}
