'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { updateIssueAssignee, updateIssuePriority, updateIssueStatus, type MutationResult } from '@/app/actions/issues';
import { STATUSES } from '@/lib/types';
import type { Priority, Status } from '@/lib/types';
import type { IssueWithNames } from '@/lib/data/issues';
import type { TeamMember } from '@/lib/data/engagements';

/**
 * Kanban-style board view of an engagement's issues, grouped into one column
 * per `Status` (see `STATUSES` in `lib/types`). This is one of two main
 * issue views (the other being the tabular `IssueTable`); both share the
 * same underlying data and mutation actions.
 *
 * Responsibility: renders each issue as a card and, for Prometeia users
 * (`isProm`), exposes inline Status/Priority/Assignee `<select>`s that call
 * the `updateIssue*` Server Actions in `app/actions/issues.ts`. For
 * non-Prometeia (Bank/SIT) users it renders read-only `StatusBadge`s instead
 * — this `isProm` gate is a UX convenience only; the actual authorization
 * boundary is Postgres RLS on the `issues` table (Bank/SIT's much more
 * restricted self-service transitions are handled instead in
 * `IssueDetailModal` via `BANK_SIT_ALLOWED_TRANSITIONS`, not here — this
 * board never lets a Bank/SIT user change status directly).
 *
 * State management: `issues` is a local copy of the `issues` prop, patched
 * optimistically field-by-field after each mutation (see `run` below) so a
 * single dropdown change doesn't force a full-page/router refresh. See the
 * effects below for how this trades off against picking up other users'
 * concurrent edits.
 */
const COLUMN_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function Board({
  issues: initialIssues,
  teamMembers,
  isProm,
}: {
  issues: IssueWithNames[];
  teamMembers: TeamMember[];
  isProm: boolean;
}) {
  const router = useRouter();
  const [issues, setIssues] = useState(initialIssues);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A real navigation/reload gives us a fresh server-fetched array — resync
  // to it rather than keep patching indefinitely on top of a stale base.
  useEffect(() => {
    setIssues(initialIssues);
  }, [initialIssues]);

  // Quick edits below patch just the one changed issue locally instead of
  // re-fetching the whole engagement (see the perf/concurrency review this
  // fixes: every micro-edit was forcing an unbounded, unpaginated
  // listIssues()+listHistoryForEngagement() re-fetch for the entire
  // engagement). That trades away one thing the old router.refresh()-per-edit
  // incidentally provided: picking up *other* users' concurrent changes.
  // Refreshing when the tab regains focus covers the common case — coming
  // back to a board after being away — without paying the full re-fetch cost
  // on every keystroke-equivalent local edit.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') router.refresh();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [router]);

  async function run(issueId: string, action: () => Promise<MutationResult>) {
    setPendingId(issueId);
    setError(null);
    try {
      // The server action returns only the fields it actually changed
      // (`patch`); merge them into the existing local issue rather than
      // replacing it, so unrelated fields already held in state aren't lost.
      const { patch } = await action();
      setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...patch } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {STATUSES.map((status) => (
        <div key={status} className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            {COLUMN_LABELS[status]} · {issues.filter((i) => i.status === status).length}
          </h2>
          <div className="flex flex-col gap-3">
            {issues
              .filter((i) => i.status === status)
              // Critical-first ordering within a column; PRIORITY_RANK gives each
              // priority a sort weight since Priority itself isn't naturally ordered.
              .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
              .map((issue) => (
                <div key={issue.id} className="rounded-lg border border-hairline bg-white p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-soft">
                      {issue.key} · {new Date(issue.created_at).toLocaleDateString('en-GB')}
                    </span>
                    <PriorityBadge priority={issue.priority} />
                  </div>
                  <Link
                    href={`?issue=${issue.id}`}
                    scroll={false}
                    className="mb-1 block text-sm font-medium text-ink hover:underline"
                  >
                    {issue.title}
                  </Link>
                  <p className="mb-2 text-xs text-ink-soft">
                    Reported by {issue.reporterName}
                    {issue.module ? ` · ${issue.module}` : ''}
                  </p>
                  {isProm ? (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                        Status
                        <select
                          value={issue.status}
                          disabled={pendingId === issue.id}
                          onChange={(e) => run(issue.id, () => updateIssueStatus(issue.id, e.target.value as Status))}
                          className="rounded-md border border-ink-soft/30 px-2 py-1 text-xs font-normal"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {COLUMN_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                        Priority
                        <select
                          value={issue.priority}
                          disabled={pendingId === issue.id}
                          onChange={(e) =>
                            run(issue.id, () => updateIssuePriority(issue.id, e.target.value as Priority))
                          }
                          className="rounded-md border border-ink-soft/30 px-2 py-1 text-xs font-normal capitalize"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                        Assignee
                        <select
                          value={issue.assignee_id ?? ''}
                          disabled={pendingId === issue.id}
                          onChange={(e) => run(issue.id, () => updateIssueAssignee(issue.id, e.target.value || null))}
                          className="w-full truncate rounded-md border border-ink-soft/30 px-2 py-1 text-xs font-normal"
                        >
                          <option value="">Unassigned</option>
                          {teamMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                          {/* The reporter (a Bank/SIT user) is never in `teamMembers`
                              (that list is Prometeia's own team, i.e. valid
                              assignees), but an issue can still be assigned back to
                              them (e.g. "needs more info from reporter"). Without this
                              extra option, an issue already assigned to its reporter
                              would silently fall back to showing "Unassigned" in the
                              <select>, since its value wouldn't match any <option>. */}
                          {!teamMembers.some((m) => m.id === issue.reporter_id) && (
                            <option value={issue.reporter_id}>↩ Back to {issue.reporterName} (reporter)</option>
                          )}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <StatusBadge status={issue.status} />
                      {issue.assigneeName && <span className="text-xs text-ink-soft">{issue.assigneeName}</span>}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
