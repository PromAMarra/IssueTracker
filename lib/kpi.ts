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
  const sit = issues.filter((i) => i.org === 'sit').length;
  const prometeia = issues.filter((i) => i.org === 'prometeia').length;
  return [
    { org: 'bank' as const, count: bank },
    { org: 'sit' as const, count: sit },
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

export type DailyDefectBucket = { date: string; opened: number; closed: number; liveDefects: number };

// One row per calendar day in [startDate, endDate] (inclusive, "YYYY-MM-DD").
// liveDefects is a historical snapshot — issues created on/before that day
// and not yet closed as of the end of that day — not just today's open count.
export function dailyDefects(issues: Issue[], startDate: string, endDate: string): DailyDefectBucket[] {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const openedCount = new Map<string, number>();
  const closedCount = new Map<string, number>();
  for (const issue of issues) {
    const openedDay = issue.created_at.slice(0, 10);
    openedCount.set(openedDay, (openedCount.get(openedDay) ?? 0) + 1);
    if (issue.closed_at) {
      const closedDay = issue.closed_at.slice(0, 10);
      closedCount.set(closedDay, (closedCount.get(closedDay) ?? 0) + 1);
    }
  }

  return days.map((day) => {
    const dayEndMs = new Date(`${day}T23:59:59.999Z`).getTime();
    const liveDefects = issues.filter((i) => {
      const createdMs = new Date(i.created_at).getTime();
      const closedMs = i.closed_at ? new Date(i.closed_at).getTime() : null;
      return createdMs <= dayEndMs && (closedMs === null || closedMs > dayEndMs);
    }).length;
    return { date: day, opened: openedCount.get(day) ?? 0, closed: closedCount.get(day) ?? 0, liveDefects };
  });
}

export type StatusHistoryEvent = { field: string; fromValue: string | null; changedAt: string };

// Total days an issue has spent in each status across its whole lifecycle
// (summed across every visit, if it was reopened more than once). Only
// `field === 'status'` events matter; `fromValue` is always the real status
// the issue was leaving (even for a "reopened" event, whose to_value is the
// generic label 'reopened' rather than the actual target status) — reading
// the NEXT segment's fromValue instead of this one's to_value is what makes
// this correct without needing to know what "reopened" resolved to.
export function statusDurations(issue: Issue, history: StatusHistoryEvent[], now: Date): Record<Status, number> {
  const totals = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const statusEvents = history
    .filter((h): h is StatusHistoryEvent & { fromValue: string } => h.field === 'status' && !!h.fromValue)
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt));

  let segmentStart = issue.created_at;
  for (const h of statusEvents) {
    totals[h.fromValue as Status] += daysBetween(segmentStart, h.changedAt);
    segmentStart = h.changedAt;
  }
  totals[issue.status] += daysBetween(segmentStart, now.toISOString());
  return totals;
}

export type StatusTransitionEvent = { field: string; fromValue: string | null; toValue: string };

// How many times this ticket was sent back to active work after Prometeia
// had marked it Ready for Test — i.e. the bank tested it, it wasn't actually
// fixed, and it bounced back rather than being closed. Only counts leaving
// Ready for Test for Ongoing or Backlog, not the success paths (Closed/
// Rejected).
export function reopenFromReadyForTestCount(history: StatusTransitionEvent[]): number {
  return history.filter(
    (h) => h.field === 'status' && h.fromValue === 'ready_for_test' && (h.toValue === 'ongoing' || h.toValue === 'backlog'),
  ).length;
}

export type TimeInStatusRow = {
  priority: Priority;
  status: Status;
  avgDays: number | null;
  medianDays: number | null;
  count: number;
};

// Average/median time spent in each status, broken down by priority. Only
// issues that actually passed through a given status count toward its
// average — an issue that skipped "Ready for Test" entirely shouldn't drag
// that status's average toward zero.
export function timeInStatusByPriority(issues: Issue[], history: IssueHistoryEntry[], now: Date): TimeInStatusRow[] {
  const historyByIssue = new Map<string, StatusHistoryEvent[]>();
  for (const h of history) {
    if (h.field !== 'status') continue;
    const list = historyByIssue.get(h.issue_id) ?? [];
    list.push({ field: h.field, fromValue: h.from_value, changedAt: h.changed_at });
    historyByIssue.set(h.issue_id, list);
  }

  const rows: TimeInStatusRow[] = [];
  for (const priority of PRIORITIES) {
    const priorityIssues = issues.filter((i) => i.priority === priority);
    for (const status of STATUSES) {
      const durations = priorityIssues
        .map((issue) => statusDurations(issue, historyByIssue.get(issue.id) ?? [], now)[status])
        .filter((d) => d > 0);
      rows.push({
        priority,
        status,
        avgDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        medianDays: durations.length ? median(durations) : null,
        count: durations.length,
      });
    }
  }
  return rows;
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
