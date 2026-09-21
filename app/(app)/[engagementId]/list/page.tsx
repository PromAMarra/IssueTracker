import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listPrometeiaTeam } from '@/lib/data/engagements';
import { listHistoryForEngagement, listIssues } from '@/lib/data/issues';
import { IssueTable } from '@/components/issues/IssueTable';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';

/**
 * `[engagementId]/list` — the flat, sortable/filterable table view of the
 * same issue set the board shows, plus per-issue history (`issue_history`
 * rows via `listHistoryForEngagement`) so `IssueTable` can render an audit
 * trail (status/field changes) alongside each row.
 *
 * `sitExpected` is passed through so `IssueTable` knows whether to show a
 * SIT column/filter at all — engagements with SIT disabled only ever have
 * `bank`/`prometeia` org issues, and the UI should not present a phase that
 * does not apply to this engagement.
 *
 * Same `?issue=<id>` modal-overlay pattern, and the same RLS-backed
 * null-means-not-found-or-not-a-member caveat on `getEngagement`, as
 * `board/page.tsx` — see that file's header comment for the full
 * explanation.
 */
export default async function ListPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { issue?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues, teamMembers, history] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listPrometeiaTeam(params.engagementId),
    listHistoryForEngagement(params.engagementId),
  ]);
  // See board/page.tsx's header comment for why a null engagement here can
  // mean either "no such id" or "RLS denied it" — both funnel here.
  if (!engagement) redirect('/');

  return (
    <>
      <IssueTable
        issues={issues}
        modules={engagement.modules}
        teamMembers={teamMembers}
        isProm={session.profile.is_prometeia}
        history={history}
        sitExpected={engagement.sit_expected}
      />
      {searchParams.issue && (
        <IssueDetailModal
          issueId={searchParams.issue}
          engagementId={engagement.id}
          isProm={session.profile.is_prometeia}
          modules={engagement.modules}
          teamMembers={teamMembers}
        />
      )}
    </>
  );
}
