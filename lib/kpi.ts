import { PRIORITIES, STATUSES } from './types';
import type { Issue, IssueHistoryEntry, Priority, SlaDays, Status } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS;
}

export function statusDistribution(issues: Issue[]): Record<Status, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const issue of issues) counts[issue.status] += 1;
  return counts;
}

export function priorityDistribution(issues: Issue[]): Record<Priority, number> {
  const counts = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  for (const issue of issues) counts[issue.priority] += 1;
  return counts;
}

export function moduleVolume(issues: Issue[]): { module: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.module ?? 'Unassigned';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);
}

export function orgVolume(issues: Issue[]): { org: Issue['org']; count: number }[] {
  const bank = issues.filter((i) => i.org === 'bank').length;
  const prometeia = issues.filter((i) => i.org === 'prometeia').length;
  return [
    { org: 'bank' as const, count: bank },
    { org: 'prometeia' as const, count: prometeia },
  ];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type TimeToCloseRow = {
  priority: Priority;
  count: number;
  avgDays: number | null;
  medianDays: number | null;
  targetDays: number;
  breachCount: number;
};

export function timeToCloseByPriority(issues: Issue[], sla: SlaDays): TimeToCloseRow[] {
  return PRIORITIES.map((priority) => {
    const closed = issues.filter(
      (i) => i.priority === priority && i.status === 'closed' && i.closed_at,
    );
    const targetDays = sla[priority];
    if (closed.length === 0) {
      return { priority, count: 0, avgDays: null, medianDays: null, targetDays, breachCount: 0 };
    }
    const durations = closed.map((i) => daysBetween(i.created_at, i.closed_at!));
    const avgDays = durations.reduce((a, b) => a + b, 0) / durations.length;
    return {
      priority,
      count: closed.length,
      avgDays,
      medianDays: median(durations),
      targetDays,
      breachCount: durations.filter((d) => d > targetDays).length,
    };
  });
}

export type AgingRow = { issue: Issue; daysOpen: number; targetDays: number; breached: boolean };

export function agingReport(issues: Issue[], sla: SlaDays, now: Date): AgingRow[] {
  return issues
    .filter((i) => i.status !== 'closed' && i.status !== 'rejected')
    .map((issue) => {
      const daysOpen = daysBetween(issue.created_at, now.toISOString());
      const targetDays = sla[issue.priority];
      return { issue, daysOpen, targetDays, breached: daysOpen > targetDays };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export type ThroughputBucket = { weekStart: string; opened: number; closed: number };

export function throughputByWeek(issues: Issue[], weeks: number, now: Date): ThroughputBucket[] {
  const buckets: ThroughputBucket[] = [];
  const cursor = new Date(now);
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.push({ weekStart: weekStart(d.toISOString()), opened: 0, closed: 0 });
  }
  const index = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const issue of issues) {
    const openedBucket = index.get(weekStart(issue.created_at));
    if (openedBucket) openedBucket.opened += 1;
    if (issue.closed_at) {
      const closedBucket = index.get(weekStart(issue.closed_at));
      if (closedBucket) closedBucket.closed += 1;
    }
  }
  return buckets;
}

export type ReopenRateResult = { everClosedCount: number; reopenedCount: number; ratePercent: number };

export function reopenRate(issues: Issue[], history: IssueHistoryEntry[]): ReopenRateResult {
  const reopenedIssueIds = new Set(
    history.filter((h) => h.field === 'status' && h.to_value === 'reopened').map((h) => h.issue_id),
  );
  const everClosedIds = new Set([
    ...issues.filter((i) => i.status === 'closed').map((i) => i.id),
    ...reopenedIssueIds,
  ]);
  const everClosedCount = everClosedIds.size;
  const reopenedCount = reopenedIssueIds.size;
  return {
    everClosedCount,
    reopenedCount,
    ratePercent: everClosedCount === 0 ? 0 : (reopenedCount / everClosedCount) * 100,
  };
}
