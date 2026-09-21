import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listPrometeiaTeam } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { listTestCaseStepOptions, type TestCaseStepOption } from '@/app/actions/testPackages';
import { Board } from '@/components/issues/Board';
import { NewIssueModal } from '@/components/issues/NewIssueModal';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';

/**
 * `[engagementId]/board` — the Kanban-style issue board, the default
 * landing page inside an engagement (see `app/(app)/page.tsx`'s redirect).
 * Prometeia users see the board read/triage-only from here; only
 * non-Prometeia (bank/SIT) users get the "new issue" creation modal, since
 * raising issues is a bank/SIT responsibility while Prometeia's role is to
 * work the backlog (backlog → ongoing → ready_for_test).
 *
 * `listIssues()` (lib/data/issues.ts) has no role/org filter of its own —
 * every member of the engagement gets every issue back; row-level scoping
 * by phase/org (e.g. for the dashboard's SIT/UAT split) happens client-side
 * in that consuming component, not here, and cross-engagement isolation is
 * RLS's job via the `engagement_id` filter plus RLS policies, not this
 * query's `.eq()` alone.
 *
 * `?issue=<id>` in the URL opens `IssueDetailModal` as an overlay on top of
 * the board — the modal's own content is fetched independently by id, so
 * this page does not need to look the issue up itself.
 */
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
  // Same RLS-backed "null means gone-or-not-a-member" caveat as the
  // engagement layout (see its header comment) — here it just bounces home
  // instead of 404ing, since the layout wrapping this page already passed
  // this same check once.
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
