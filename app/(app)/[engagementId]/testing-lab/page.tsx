import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listPrometeiaTeam } from '@/lib/data/engagements';
import { getTestPackageDetail, listTestCaseStepOptions, listTestPackages } from '@/app/actions/testPackages';
import { PackageTabs } from '@/components/testinglab/PackageTabs';
import { TestPackageView } from '@/components/testinglab/TestPackageView';

export default async function TestingLabPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { package?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagement = await getEngagement(params.engagementId);
  if (!engagement) redirect('/');
  if (!engagement.test_cases_enabled) redirect(`/${params.engagementId}/board`);

  const [packages, teamMembers, testCaseStepOptions] = await Promise.all([
    listTestPackages(params.engagementId),
    listPrometeiaTeam(params.engagementId),
    listTestCaseStepOptions(params.engagementId),
  ]);

  if (packages.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          No test packages uploaded yet — ask Prometeia to upload one in Settings.
        </p>
      </div>
    );
  }

  const activePackageId =
    searchParams.package && packages.some((p) => p.id === searchParams.package)
      ? searchParams.package
      : packages[0].id;

  const detail = await getTestPackageDetail(activePackageId);

  return (
    <div className="flex flex-col gap-4">
      <PackageTabs engagementId={params.engagementId} packages={packages} activePackageId={activePackageId} />
      <TestPackageView
        key={activePackageId}
        engagementId={params.engagementId}
        detail={detail}
        isProm={session.profile.is_prometeia}
        modules={engagement.modules}
        teamMembers={teamMembers}
        testCasesEnabled={engagement.test_cases_enabled}
        testCaseStepOptions={testCaseStepOptions}
      />
    </div>
  );
}
