'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { updateIssueAssignee, updateIssueModule, updateIssuePriority, updateIssueStatus } from '@/app/actions/issues';
import { reopenFromReadyForTestCount, statusDurations } from '@/lib/kpi';
import { PRIORITIES, STATUSES } from '@/lib/types';
import type { IssueHistoryEntry, Org, Priority, Status } from '@/lib/types';
import type { IssueWithNames } from '@/lib/data/issues';
import type { TeamMember } from '@/lib/data/engagements';
import { downloadWorkbook } from '@/lib/exportXlsx';

type SortKey =
  | 'key'
  | 'title'
  | 'status'
  | 'priority'
  | 'module'
  | 'assigneeName'
  | 'reporterName'
  | 'org'
  | 'created_at'
  | 'updated_at'
  | 'closed_at';

const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

const ORG_LABELS: Record<Org, string> = { bank: 'Bank', sit: 'SIT', prometeia: 'Prometeia' };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'key', label: 'Key' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'module', label: 'Module' },
  { key: 'assigneeName', label: 'Assignee' },
  { key: 'reporterName', label: 'Reporter' },
  { key: 'org', label: 'Raised by' },
  { key: 'created_at', label: 'Opened' },
  { key: 'updated_at', label: 'Last updated' },
  { key: 'closed_at', label: 'Closed' },
];

const TOTAL_COLUMNS = COLUMNS.length + STATUSES.length + 1;

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB') : '—';
}

function formatDuration(days: number): string {
  return days > 0 ? `${days.toFixed(1)}d` : '—';
}

export function IssueTable({
  issues,
  modules,
  teamMembers,
  isProm,
  history,
}: {
  issues: IssueWithNames[];
  modules: string[];
  teamMembers: TeamMember[];
  isProm: boolean;
  history: IssueHistoryEntry[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState<Org | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { durationsById, reopenCountById } = useMemo(() => {
    const historyByIssue = new Map<
      string,
      { field: string; fromValue: string | null; toValue: string; changedAt: string }[]
    >();
    for (const h of history) {
      if (h.field !== 'status') continue;
      const list = historyByIssue.get(h.issue_id) ?? [];
      list.push({ field: h.field, fromValue: h.from_value, toValue: h.to_value, changedAt: h.changed_at });
      historyByIssue.set(h.issue_id, list);
    }
    const now = new Date();
    const durations = new Map<string, Record<Status, number>>();
    const reopenCounts = new Map<string, number>();
    for (const issue of issues) {
      const issueHistory = historyByIssue.get(issue.id) ?? [];
      durations.set(issue.id, statusDurations(issue, issueHistory, now));
      reopenCounts.set(issue.id, reopenFromReadyForTestCount(issueHistory));
    }
    return { durationsById: durations, reopenCountById: reopenCounts };
  }, [issues, history]);

  const rows = useMemo(() => {
    let result = issues;
    if (statusFilter) result = result.filter((i) => i.status === statusFilter);
    if (priorityFilter) result = result.filter((i) => i.priority === priorityFilter);
    if (moduleFilter) result = result.filter((i) => (i.module ?? 'Unassigned') === moduleFilter);
    if (orgFilter) result = result.filter((i) => i.org === orgFilter);

    const sorted = [...result].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [issues, statusFilter, priorityFilter, moduleFilter, orgFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

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

  async function handleExport() {
    await downloadWorkbook(
      [
        {
          name: 'Issues',
          rows: rows.map((issue) => {
            const durations = durationsById.get(issue.id);
            const durationCols = Object.fromEntries(
              STATUSES.map((s) => [`Time in ${STATUS_LABELS[s]} (d)`, durations ? Number(durations[s].toFixed(1)) : 0]),
            );
            return {
              Key: issue.key,
              Title: issue.title,
              Status: STATUS_LABELS[issue.status],
              Priority: issue.priority,
              Module: issue.module ?? 'Unassigned',
              Assignee: issue.assigneeName ?? '',
              Reporter: issue.reporterName,
              'Raised by': ORG_LABELS[issue.org],
              Opened: new Date(issue.created_at).toLocaleDateString(),
              'Last updated': new Date(issue.updated_at).toLocaleDateString(),
              Closed: issue.closed_at ? new Date(issue.closed_at).toLocaleDateString() : '',
              ...durationCols,
              'Reopened from RFT': reopenCountById.get(issue.id) ?? 0,
            };
          }),
        },
      ],
      `issues-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | '')}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm capitalize"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="Unassigned">Unassigned</option>
        </select>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value as Org | '')}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
        >
          <option value="">Bank + SIT + Prometeia</option>
          <option value="bank">Bank</option>
          <option value="sit">SIT</option>
          <option value="prometeia">Prometeia</option>
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="ml-auto rounded border border-ink-soft/30 px-3 py-1 text-sm font-medium text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export to Excel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-soft/10 text-xs uppercase tracking-wide text-ink-soft">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="cursor-pointer whitespace-nowrap px-3 py-2"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              {STATUSES.map((s) => (
                <th key={s} className="whitespace-nowrap px-3 py-2">
                  Time in {STATUS_LABELS[s]}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2" title="Times sent back to Ongoing/Backlog after Prometeia marked it Ready for Test">
                Reopened from RFT
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr key={issue.id} className="border-b border-ink-soft/5 last:border-0 hover:bg-surface">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{issue.key}</td>
                <td className="px-3 py-2">
                  <Link href={`?issue=${issue.id}`} scroll={false} className="text-ink hover:underline">
                    {issue.title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {isProm ? (
                    <select
                      value={issue.status}
                      disabled={pendingId === issue.id}
                      onChange={(e) => run(issue.id, () => updateIssueStatus(issue.id, e.target.value as Status))}
                      className="rounded border border-ink-soft/30 px-2 py-1 text-xs font-normal"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge status={issue.status} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isProm ? (
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
                  ) : (
                    <PriorityBadge priority={issue.priority} />
                  )}
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  {isProm ? (
                    <select
                      value={issue.module ?? ''}
                      disabled={pendingId === issue.id}
                      onChange={(e) => run(issue.id, () => updateIssueModule(issue.id, e.target.value || null))}
                      className="rounded border border-ink-soft/30 px-2 py-1 text-xs"
                    >
                      <option value="">No module</option>
                      {modules.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (issue.module ?? 'Unassigned')
                  )}
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  {isProm ? (
                    <select
                      value={issue.assignee_id ?? ''}
                      disabled={pendingId === issue.id}
                      onChange={(e) => run(issue.id, () => updateIssueAssignee(issue.id, e.target.value || null))}
                      className="rounded border border-ink-soft/30 px-2 py-1 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                      {!teamMembers.some((m) => m.id === issue.reporter_id) && (
                        <option value={issue.reporter_id}>↩ Back to {issue.reporterName} (reporter)</option>
                      )}
                    </select>
                  ) : (
                    (issue.assigneeName ?? '—')
                  )}
                </td>
                <td className="px-3 py-2 text-ink-soft">{issue.reporterName}</td>
                <td className="px-3 py-2 text-ink-soft">{ORG_LABELS[issue.org]}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                  {formatDate(issue.created_at)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                  {formatDate(issue.updated_at)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                  {formatDate(issue.closed_at)}
                </td>
                {STATUSES.map((s) => {
                  const durations = durationsById.get(issue.id);
                  return (
                    <td key={s} className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                      {formatDuration(durations ? durations[s] : 0)}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                  {reopenCountById.get(issue.id) ?? 0}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={TOTAL_COLUMNS} className="px-3 py-6 text-center text-ink-soft">
                  No issues match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
