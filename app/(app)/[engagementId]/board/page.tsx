import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { Board } from '@/components/issues/Board';
import { NewIssueForm } from '@/components/issues/NewIssueForm';

export default async function BoardPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-6">
      <NewIssueForm engagementId={engagement.id} modules={engagement.modules} />
      <Board issues={issues} teamMembers={engagement.team_members} isProm={session.profile.is_prometeia} />
    </div>
  );
}
