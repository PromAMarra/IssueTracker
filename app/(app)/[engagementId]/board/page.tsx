import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listPrometeiaTeam } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { listTestCaseStepOptions, type TestCaseStepOption } from '@/app/actions/testPackages';
import { Board } from '@/components/issues/Board';
import { NewIssueModal } from '@/components/issues/NewIssueModal';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { issue?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues, teamMembers, testCaseStepOptions] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listPrometeiaTeam(params.engagementId),
    // NewIssueModal (the only consumer of this) is never rendered for Prometeia users,
    // so skip the full-engagement test-package/step join for the board's primary audience.
    session.profile.is_prometeia
      ? Promise.resolve<TestCaseStepOption[]>([])
      : listTestCaseStepOptions(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-6">
      {!session.profile.is_prometeia && (
        <NewIssueModal
          engagementId={engagement.id}
          modules={engagement.modules}
          testCasePackages={engagement.test_case_packages}
          testCasesEnabled={engagement.test_cases_enabled}
          testCaseStepOptions={testCaseStepOptions}
          teamMembers={teamMembers}
        />
      )}
      <Board issues={issues} teamMembers={teamMembers} isProm={session.profile.is_prometeia} />
      {searchParams.issue && (
        <IssueDetailModal
          issueId={searchParams.issue}
          engagementId={engagement.id}
          isProm={session.profile.is_prometeia}
          modules={engagement.modules}
          teamMembers={teamMembers}
        />
      )}
    </div>
  );
}
