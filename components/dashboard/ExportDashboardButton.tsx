'use client';

import { downloadWorkbook } from '@/lib/exportXlsx';
import type { AgingRow, DailyDefectBucket, ThroughputBucket, TimeInStatusRow, TimeToCloseRow } from '@/lib/kpi';
import type { Org, Priority, Status } from '@/lib/types';

export function ExportDashboardButton({
  engagementName,
  statusDist,
  priorityDist,
  timeToClose,
  timeInStatus,
  throughput,
  aging,
  moduleVol,
  orgVol,
  sitDaily,
  uatDaily,
}: {
  engagementName: string;
  statusDist: Record<Status, number>;
  priorityDist: Record<Priority, number>;
  timeToClose: TimeToCloseRow[];
  timeInStatus: TimeInStatusRow[];
  throughput: ThroughputBucket[];
  aging: AgingRow[];
  moduleVol: { module: string; count: number }[];
  orgVol: { org: Org; count: number }[];
  sitDaily: DailyDefectBucket[];
  uatDaily: DailyDefectBucket[];
}) {
  async function handleExport() {
    const safeName = engagementName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engagement';
    const dailyRows = (rows: DailyDefectBucket[]) =>
      rows.map((r) => ({ Date: r.date, 'Defects New': r.opened, 'Defects Closed': r.closed, 'Current Live Defects': r.liveDefects }));

    await downloadWorkbook(
      [
        ...(sitDaily.length > 0 ? [{ name: 'Daily Defects (SIT)', rows: dailyRows(sitDaily) }] : []),
        ...(uatDaily.length > 0 ? [{ name: 'Daily Defects (UAT)', rows: dailyRows(uatDaily) }] : []),
        {
          name: 'Status',
          rows: Object.entries(statusDist).map(([status, count]) => ({ Status: status, Count: count })),
        },
        {
          name: 'Priority',
          rows: Object.entries(priorityDist).map(([priority, count]) => ({ Priority: priority, Count: count })),
        },
        {
          name: 'Time To Close',
          rows: timeToClose.map((r) => ({
            Priority: r.priority,
            'Closed Count': r.count,
            'Avg Days To Close': r.avgDays !== null ? Number(r.avgDays.toFixed(1)) : '',
            'Median Days To Close': r.medianDays !== null ? Number(r.medianDays.toFixed(1)) : '',
            'SLA Target (Days)': r.targetDays,
            'Breach Count': r.breachCount,
          })),
        },
        {
          name: 'Time In Status',
          rows: timeInStatus.map((r) => ({
            Priority: r.priority,
            Status: r.status,
            'Avg Days': r.avgDays !== null ? Number(r.avgDays.toFixed(1)) : '',
            'Median Days': r.medianDays !== null ? Number(r.medianDays.toFixed(1)) : '',
            'Issue Count': r.count,
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
            'Days Open': Number(r.daysOpen.toFixed(1)),
            'SLA Target (Days)': r.targetDays,
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
      className="rounded-md border border-ink-soft/30 px-3 py-1.5 text-sm font-medium text-ink hover:bg-primary-soft"
    >
      Export To Excel
    </button>
  );
}
