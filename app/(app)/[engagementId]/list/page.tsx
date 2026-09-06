import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { IssueTable } from '@/components/issues/IssueTable';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';

export default async function ListPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { issue?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <>
      <IssueTable issues={issues} modules={engagement.modules} />
      {searchParams.issue && (
        <IssueDetailModal
          issueId={searchParams.issue}
          isProm={session.profile.is_prometeia}
          modules={engagement.modules}
          teamMembers={engagement.team_members}
        />
      )}
    </>
  );
}
