'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { updateIssueAssignee, updateIssuePriority, updateIssueStatus } from '@/app/actions/issues';
import { STATUSES } from '@/lib/types';
import type { Priority, Status } from '@/lib/types';
import type { IssueWithReporter } from '@/lib/data/issues';

const COLUMN_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export function Board({
  issues,
  teamMembers,
  isProm,
}: {
  issues: IssueWithReporter[];
  teamMembers: string[];
  isProm: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(issueId: string, action: () => Promise<void>) {
    setPendingId(issueId);
    setError(null);
    try {
      await action();
      router.refresh();
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {COLUMN_LABELS[status]} · {issues.filter((i) => i.status === status).length}
          </h2>
          <div className="flex flex-col gap-3">
            {issues
              .filter((i) => i.status === status)
              .map((issue) => (
                <div key={issue.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-soft">
                      {issue.key} · {new Date(issue.created_at).toLocaleDateString('en-GB')}
                    </span>
                    <PriorityBadge priority={issue.priority} />
                  </div>
                  <a href={`?issue=${issue.id}`} className="mb-1 block text-sm font-medium text-ink hover:underline">
                    {issue.title}
                  </a>
                  <p className="mb-2 text-xs text-ink-soft">
                    Reported by {issue.reporterName}
                    {issue.module ? ` · ${issue.module}` : ''}
                  </p>
                  {isProm ? (
                    <div className="flex flex-col gap-2">
                      <select
                        value={issue.status}
                        disabled={pendingId === issue.id}
                        onChange={(e) => run(issue.id, () => updateIssueStatus(issue.id, e.target.value as Status))}
                        className="rounded border border-ink-soft/30 px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {COLUMN_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={issue.priority}
                        disabled={pendingId === issue.id}
                        onChange={(e) =>
                          run(issue.id, () => updateIssuePriority(issue.id, e.target.value as Priority))
                        }
                        className="rounded border border-ink-soft/30 px-2 py-1 text-xs capitalize"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <select
                        value={issue.assignee ?? ''}
                        disabled={pendingId === issue.id}
                        onChange={(e) => run(issue.id, () => updateIssueAssignee(issue.id, e.target.value || null))}
                        className="rounded border border-ink-soft/30 px-2 py-1 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                        {!teamMembers.includes(issue.reporterName) && (
                          <option value={issue.reporterName}>↩ Back to {issue.reporterName} (reporter)</option>
                        )}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <StatusBadge status={issue.status} />
                      {issue.assignee && <span className="text-xs text-ink-soft">{issue.assignee}</span>}
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
