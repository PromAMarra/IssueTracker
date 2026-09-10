import { describe, expect, it } from 'vitest';
import {
  agingReport,
  dailyDefects,
  moduleVolume,
  orgVolume,
  priorityDistribution,
  reopenFromReadyForTestCount,
  reopenRate,
  statusDistribution,
  statusDurations,
  throughputByWeek,
  timeInStatusByPriority,
  timeToCloseByPriority,
} from './kpi';
import type { Issue, IssueHistoryEntry, SlaDays } from './types';

const sla: SlaDays = { critical: 2, high: 5, medium: 10, low: 20 };

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: 'i1',
    engagement_id: 'e1',
    key: 'BANK-1',
    title: 'Sample',
    description: '',
    status: 'backlog',
    priority: 'medium',
    module: 'Payments',
    test_case_package: null,
    test_case_step: null,
    org: 'bank',
    reporter_id: 'u1',
    assignee_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
    ...overrides,
  };
}

describe('statusDistribution', () => {
  it('counts every status, including zero for statuses absent from the input', () => {
    const issues = [
      issue({ id: 'a', status: 'backlog' }),
      issue({ id: 'b', status: 'ongoing' }),
      issue({ id: 'c', status: 'ongoing' }),
    ];
    expect(statusDistribution(issues)).toEqual({
      backlog: 1,
      ongoing: 2,
      ready_for_test: 0,
      closed: 0,
      rejected: 0,
    });
  });
});

describe('priorityDistribution', () => {
  it('counts every priority', () => {
    const issues = [
      issue({ id: 'a', priority: 'critical' }),
      issue({ id: 'b', priority: 'critical' }),
      issue({ id: 'c', priority: 'low' }),
    ];
    expect(priorityDistribution(issues)).toEqual({
      critical: 2,
      high: 0,
      medium: 0,
      low: 1,
    });
  });
});

describe('moduleVolume', () => {
  it('groups by module, sorted descending, with a null module folded to Unassigned', () => {
    const issues = [
      issue({ id: 'a', module: 'Payments' }),
      issue({ id: 'b', module: 'Payments' }),
      issue({ id: 'c', module: 'Onboarding' }),
      issue({ id: 'd', module: null }),
    ];
    expect(moduleVolume(issues)).toEqual([
      { module: 'Payments', count: 2 },
      { module: 'Onboarding', count: 1 },
      { module: 'Unassigned', count: 1 },
    ]);
  });
});

describe('orgVolume', () => {
  it('counts issues raised by each org, including SIT', () => {
    const issues = [
      issue({ id: 'a', org: 'bank' }),
      issue({ id: 'b', org: 'bank' }),
      issue({ id: 'c', org: 'prometeia' }),
      issue({ id: 'd', org: 'sit' }),
    ];
    expect(orgVolume(issues)).toEqual([
      { org: 'bank', count: 2 },
      { org: 'sit', count: 1 },
      { org: 'prometeia', count: 1 },
    ]);
  });
});

describe('timeToCloseByPriority', () => {
  it('computes average and median days-to-close and flags SLA breaches', () => {
    const issues = [
      // critical, target 2 days: closed in 1 day (within SLA)
      issue({
        id: 'a',
        priority: 'critical',
        status: 'closed',
        created_at: '2026-01-01T00:00:00.000Z',
        closed_at: '2026-01-02T00:00:00.000Z',
      }),
      // critical, target 2 days: closed in 5 days (breach)
      issue({
        id: 'b',
        priority: 'critical',
        status: 'closed',
        created_at: '2026-01-01T00:00:00.000Z',
        closed_at: '2026-01-06T00:00:00.000Z',
      }),
      // still open — must be excluded
      issue({ id: 'c', priority: 'critical', status: 'ongoing' }),
    ];
    const result = timeToCloseByPriority(issues, sla);
    const critical = result.find((r) => r.priority === 'critical')!;
    expect(critical.count).toBe(2);
    expect(critical.avgDays).toBe(3);
    expect(critical.medianDays).toBe(3);
    expect(critical.targetDays).toBe(2);
    expect(critical.breachCount).toBe(1);

    const high = result.find((r) => r.priority === 'high')!;
    expect(high.count).toBe(0);
    expect(high.avgDays).toBeNull();
  });
});

describe('agingReport', () => {
  it('reports days-open for currently-open issues only, sorted oldest first, with SLA breach flagged', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const issues = [
      issue({ id: 'a', status: 'closed', priority: 'low', created_at: '2026-01-01T00:00:00.000Z' }),
      issue({ id: 'b', status: 'ongoing', priority: 'critical', created_at: '2026-01-08T00:00:00.000Z' }), // 2 days open, target 2 -> not breached
      issue({ id: 'c', status: 'backlog', priority: 'critical', created_at: '2026-01-01T00:00:00.000Z' }), // 9 days open, target 2 -> breached
    ];
    const rows = agingReport(issues, sla, now);
    expect(rows.map((r) => r.issue.id)).toEqual(['c', 'b']);
    expect(rows[0].daysOpen).toBe(9);
    expect(rows[0].breached).toBe(true);
    expect(rows[1].daysOpen).toBe(2);
    expect(rows[1].breached).toBe(false);
  });
});

describe('throughputByWeek', () => {
  it('buckets opened and closed counts into week-start buckets', () => {
    const now = new Date('2026-01-19T00:00:00.000Z'); // a Monday
    const issues = [
      issue({ id: 'a', created_at: '2026-01-12T00:00:00.000Z', status: 'backlog' }), // opened week of Jan 12
      issue({
        id: 'b',
        created_at: '2026-01-05T00:00:00.000Z',
        status: 'closed',
        closed_at: '2026-01-13T00:00:00.000Z',
      }), // opened week of Jan 5, closed week of Jan 12
    ];
    const buckets = throughputByWeek(issues, 3, now);
    expect(buckets).toHaveLength(3);
    const jan12 = buckets.find((b) => b.weekStart === '2026-01-12')!;
    expect(jan12.opened).toBe(1);
    expect(jan12.closed).toBe(1);
    const jan5 = buckets.find((b) => b.weekStart === '2026-01-05')!;
    expect(jan5.opened).toBe(1);
    expect(jan5.closed).toBe(0);
  });
});

describe('dailyDefects', () => {
  it('buckets opened/closed per day and computes a historical live-defect snapshot', () => {
    const issues = [
      // open on day 1, still open throughout
      issue({ id: 'a', created_at: '2026-02-01T09:00:00.000Z', status: 'ongoing' }),
      // open on day 1, closed on day 3
      issue({
        id: 'b',
        created_at: '2026-02-01T10:00:00.000Z',
        status: 'closed',
        closed_at: '2026-02-03T08:00:00.000Z',
      }),
      // open on day 2
      issue({ id: 'c', created_at: '2026-02-02T12:00:00.000Z', status: 'backlog' }),
    ];
    const now = new Date('2026-02-10T00:00:00.000Z'); // well after the whole range — nothing to cap here
    const buckets = dailyDefects(issues, '2026-02-01', '2026-02-03', now);
    expect(buckets.map((b) => b.date)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);

    expect(buckets[0]).toEqual({ date: '2026-02-01', opened: 2, closed: 0, liveDefects: 2 });
    expect(buckets[1]).toEqual({ date: '2026-02-02', opened: 1, closed: 0, liveDefects: 3 });
    // b closes on day 3, so it drops out of the live count as of that day's end
    expect(buckets[2]).toEqual({ date: '2026-02-03', opened: 0, closed: 1, liveDefects: 2 });
  });

  it('returns an empty array when the range is empty or inverted', () => {
    expect(dailyDefects([], '2026-02-05', '2026-02-01', new Date('2026-02-10T00:00:00.000Z'))).toEqual([]);
  });

  it('caps the range at "now" instead of projecting the live-defects line into the future', () => {
    const issues = [issue({ id: 'a', created_at: '2026-02-01T00:00:00.000Z', status: 'ongoing' })];
    const now = new Date('2026-02-03T00:00:00.000Z');
    // configured period runs through 02-10, but only up to "now" has happened
    const buckets = dailyDefects(issues, '2026-02-01', '2026-02-10', now);
    expect(buckets.map((b) => b.date)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
  });
});

describe('statusDurations', () => {
  it('sums time in each status, using fromValue chains so a generic "reopened" to_value never matters', () => {
    const closedIssue = issue({ id: 'a', status: 'closed', created_at: '2026-01-01T00:00:00.000Z' });
    const history = [
      { field: 'status', fromValue: 'backlog', changedAt: '2026-01-02T00:00:00.000Z' },
      { field: 'status', fromValue: 'ongoing', changedAt: '2026-01-04T00:00:00.000Z' },
      // this event represents a reopen — its real to_value is 'reopened' in
      // the DB, but that's irrelevant here since only fromValue is read
      { field: 'status', fromValue: 'closed', changedAt: '2026-01-05T00:00:00.000Z' },
      { field: 'status', fromValue: 'ongoing', changedAt: '2026-01-07T00:00:00.000Z' },
    ];
    const now = new Date('2026-01-09T00:00:00.000Z');
    const totals = statusDurations(closedIssue, history, now);
    expect(totals.backlog).toBe(1);
    expect(totals.ongoing).toBe(4);
    expect(totals.closed).toBe(3);
    expect(totals.ready_for_test).toBe(0);
    expect(totals.rejected).toBe(0);
  });

  it('attributes all elapsed time to the current status when there is no history', () => {
    const now = new Date('2026-01-04T00:00:00.000Z');
    const totals = statusDurations(
      issue({ id: 'a', status: 'ongoing', created_at: '2026-01-01T00:00:00.000Z' }),
      [],
      now,
    );
    expect(totals.ongoing).toBe(3);
    expect(totals.backlog).toBe(0);
  });

  it('ignores history entries for other fields', () => {
    const now = new Date('2026-01-02T00:00:00.000Z');
    const totals = statusDurations(
      issue({ id: 'a', status: 'backlog', created_at: '2026-01-01T00:00:00.000Z' }),
      [{ field: 'priority', fromValue: 'high', changedAt: '2026-01-01T12:00:00.000Z' }],
      now,
    );
    expect(totals.backlog).toBe(1);
  });
});

describe('reopenFromReadyForTestCount', () => {
  it('counts leaving Ready for Test for Ongoing or Backlog, not the success paths', () => {
    const history = [
      { field: 'status', fromValue: 'backlog', toValue: 'ready_for_test' },
      { field: 'status', fromValue: 'ready_for_test', toValue: 'ongoing' }, // bounced back once
      { field: 'status', fromValue: 'ongoing', toValue: 'ready_for_test' },
      { field: 'status', fromValue: 'ready_for_test', toValue: 'backlog' }, // bounced back twice
      { field: 'status', fromValue: 'backlog', toValue: 'ready_for_test' },
      { field: 'status', fromValue: 'ready_for_test', toValue: 'closed' }, // success — not a bounce
    ];
    expect(reopenFromReadyForTestCount(history)).toBe(2);
  });

  it('ignores non-status fields and tickets that never reached Ready for Test', () => {
    const history = [
      { field: 'priority', fromValue: 'medium', toValue: 'high' },
      { field: 'status', fromValue: 'backlog', toValue: 'ongoing' },
      { field: 'status', fromValue: 'ongoing', toValue: 'closed' },
    ];
    expect(reopenFromReadyForTestCount(history)).toBe(0);
  });
});

describe('timeInStatusByPriority', () => {
  it('only averages a status across issues that actually passed through it', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const issues = [
      // passed through ready_for_test for 2 days before closing
      issue({ id: 'a', priority: 'high', status: 'closed', created_at: '2026-01-01T00:00:00.000Z' }),
      // never reached ready_for_test — went straight backlog -> closed
      issue({ id: 'b', priority: 'high', status: 'closed', created_at: '2026-01-01T00:00:00.000Z' }),
    ];
    const history: IssueHistoryEntry[] = [
      {
        id: 'h1',
        issue_id: 'a',
        field: 'status',
        from_value: 'backlog',
        to_value: 'ready_for_test',
        changed_by: 'u1',
        changed_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'h2',
        issue_id: 'a',
        field: 'status',
        from_value: 'ready_for_test',
        to_value: 'closed',
        changed_by: 'u1',
        changed_at: '2026-01-04T00:00:00.000Z',
      },
      {
        id: 'h3',
        issue_id: 'b',
        field: 'status',
        from_value: 'backlog',
        to_value: 'closed',
        changed_by: 'u1',
        changed_at: '2026-01-03T00:00:00.000Z',
      },
    ];
    const rows = timeInStatusByPriority(issues, history, now);
    const readyForTest = rows.find((r) => r.priority === 'high' && r.status === 'ready_for_test')!;
    expect(readyForTest.count).toBe(1);
    expect(readyForTest.avgDays).toBe(2);

    const backlog = rows.find((r) => r.priority === 'high' && r.status === 'backlog')!;
    expect(backlog.count).toBe(2);
    expect(backlog.avgDays).toBeCloseTo((1 + 2) / 2, 5);
  });
});

describe('reopenRate', () => {
  it('divides reopened issues by every issue that was ever closed', () => {
    const issues = [
      issue({ id: 'a', status: 'closed' }),
      issue({ id: 'b', status: 'closed' }),
      // reopened: currently ongoing again, but was closed once (per history)
      issue({ id: 'c', status: 'ongoing' }),
    ];
    const history: IssueHistoryEntry[] = [
      {
        id: 'h1',
        issue_id: 'c',
        field: 'status',
        from_value: 'closed',
        to_value: 'reopened',
        changed_by: 'u1',
        changed_at: '2026-01-05T00:00:00.000Z',
      },
    ];
    const result = reopenRate(issues, history);
    expect(result.everClosedCount).toBe(3);
    expect(result.reopenedCount).toBe(1);
    expect(result.ratePercent).toBeCloseTo(33.33, 1);
  });

  it('returns a zero rate with no division-by-zero when nothing was ever closed', () => {
    const result = reopenRate([issue({ id: 'a', status: 'backlog' })], []);
    expect(result.everClosedCount).toBe(0);
    expect(result.ratePercent).toBe(0);
  });
});
