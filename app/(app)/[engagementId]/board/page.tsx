import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listPrometeiaTeam } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { Board } from '@/components/issues/Board';
import { NewIssueForm } from '@/components/issues/NewIssueForm';
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

  const [engagement, issues, teamMembers] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listPrometeiaTeam(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-6">
      <NewIssueForm
        engagementId={engagement.id}
        modules={engagement.modules}
        testCasePackages={engagement.test_case_packages}
        teamMembers={teamMembers}
      />
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
