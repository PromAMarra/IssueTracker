'use client';

import { downloadWorkbook } from '@/lib/exportXlsx';
import type { AgingRow, ThroughputBucket, TimeToCloseRow } from '@/lib/kpi';
import type { Org, Priority, Status } from '@/lib/types';

export function ExportDashboardButton({
  engagementName,
  statusDist,
  priorityDist,
  timeToClose,
  throughput,
  aging,
  moduleVol,
  orgVol,
}: {
  engagementName: string;
  statusDist: Record<Status, number>;
  priorityDist: Record<Priority, number>;
  timeToClose: TimeToCloseRow[];
  throughput: ThroughputBucket[];
  aging: AgingRow[];
  moduleVol: { module: string; count: number }[];
  orgVol: { org: Org; count: number }[];
}) {
  async function handleExport() {
    const safeName = engagementName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engagement';

    await downloadWorkbook(
      [
        {
          name: 'Status',
          rows: Object.entries(statusDist).map(([status, count]) => ({ Status: status, Count: count })),
        },
        {
          name: 'Priority',
          rows: Object.entries(priorityDist).map(([priority, count]) => ({ Priority: priority, Count: count })),
        },
        {
          name: 'Time to Close',
          rows: timeToClose.map((r) => ({
            Priority: r.priority,
            'Closed count': r.count,
            'Avg days to close': r.avgDays !== null ? Number(r.avgDays.toFixed(1)) : '',
            'Median days to close': r.medianDays !== null ? Number(r.medianDays.toFixed(1)) : '',
            'SLA target (days)': r.targetDays,
            'Breach count': r.breachCount,
          })),
        },
        {
          name: 'Throughput',
          rows: throughput.map((b) => ({ Week: b.weekStart, Opened: b.opened, Closed: b.closed })),
        },
        {
          name: 'Aging',
          rows: aging.map((r) => ({
            Key: r.issue.key,
            Title: r.issue.title,
            Priority: r.issue.priority,
            'Days open': Number(r.daysOpen.toFixed(1)),
            'SLA target (days)': r.targetDays,
            Breached: r.breached ? 'Yes' : 'No',
          })),
        },
        {
          name: 'By Module',
          rows: moduleVol.map((m) => ({ Module: m.module, Count: m.count })),
        },
        {
          name: 'By Org',
          rows: orgVol.map((o) => ({ Org: o.org, Count: o.count })),
        },
      ],
      `${safeName}-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded border border-ink-soft/30 px-3 py-1.5 text-sm font-medium text-ink hover:bg-white"
    >
      Export to Excel
    </button>
  );
}
