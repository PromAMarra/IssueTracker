'use client';

import { useMemo, useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { PRIORITIES, STATUSES } from '@/lib/types';
import type { Org, Priority, Status } from '@/lib/types';
import type { IssueWithNames } from '@/lib/data/issues';
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
  | 'created_at';

const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

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
];

export function IssueTable({ issues, modules }: { issues: IssueWithNames[]; modules: string[] }) {
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState<Org | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  function handleExport() {
    downloadWorkbook(
      [
        {
          name: 'Issues',
          rows: rows.map((issue) => ({
            Key: issue.key,
            Title: issue.title,
            Status: STATUS_LABELS[issue.status],
            Priority: issue.priority,
            Module: issue.module ?? 'Unassigned',
            Assignee: issue.assigneeName ?? '',
            Reporter: issue.reporterName,
            'Raised by': issue.org,
            Opened: new Date(issue.created_at).toLocaleDateString(),
          })),
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
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm capitalize"
        >
          <option value="">Bank + Prometeia</option>
          <option value="bank">Bank</option>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr key={issue.id} className="border-b border-ink-soft/5 last:border-0 hover:bg-surface">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{issue.key}</td>
                <td className="px-3 py-2">
                  <a href={`?issue=${issue.id}`} className="text-ink hover:underline">
                    {issue.title}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={issue.status} />
                </td>
                <td className="px-3 py-2">
                  <PriorityBadge priority={issue.priority} />
                </td>
                <td className="px-3 py-2 text-ink-soft">{issue.module ?? 'Unassigned'}</td>
                <td className="px-3 py-2 text-ink-soft">{issue.assigneeName ?? '—'}</td>
                <td className="px-3 py-2 text-ink-soft">{issue.reporterName}</td>
                <td className="px-3 py-2 capitalize text-ink-soft">{issue.org}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                  {new Date(issue.created_at).toLocaleDateString('en-GB')}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-ink-soft">
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
