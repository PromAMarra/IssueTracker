import { describe, expect, it } from 'vitest';
import { perPackageResultBreakdown, testedTrend } from './testPackageDashboard';

describe('testedTrend', () => {
  const now = new Date('2026-01-10T12:00:00.000Z');

  it('computes cumulative tested count per day up to today, and a linear target line', () => {
    const steps = [
      { result: 'passed' as const, resultUpdatedAt: '2026-01-02T09:00:00.000Z' },
      { result: 'failed' as const, resultUpdatedAt: '2026-01-05T09:00:00.000Z' },
      { result: null, resultUpdatedAt: null },
      { result: null, resultUpdatedAt: null },
    ];
    const trend = testedTrend(steps, '2026-01-01', '2026-01-11', now);
    expect(trend).toHaveLength(11);
    expect(trend[0].date).toBe('2026-01-01');
    expect(trend[0].cumulativeTested).toBe(0);
    expect(trend[1].cumulativeTested).toBe(1);
    expect(trend[4].cumulativeTested).toBe(2);
    expect(trend[9].date).toBe('2026-01-10');
    expect(trend[9].cumulativeTested).toBe(2);
    expect(trend[0].targetCumulative).toBe(0);
    expect(trend[10].targetCumulative).toBe(4);
  });

  it('returns null cumulativeTested for days after now', () => {
    const steps = [{ result: 'passed' as const, resultUpdatedAt: '2026-01-02T09:00:00.000Z' }];
    const trend = testedTrend(steps, '2026-01-01', '2026-01-20', now);
    const afterToday = trend.find((t) => t.date === '2026-01-15');
    expect(afterToday?.cumulativeTested).toBeNull();
  });

  it('returns an empty array for a misconfigured period (end before start)', () => {
    const steps = [{ result: 'passed' as const, resultUpdatedAt: '2026-01-01T00:00:00.000Z' }];
    const trend = testedTrend(steps, '2026-01-05', '2026-01-01', now);
    expect(trend).toHaveLength(0);
  });
});

describe('perPackageResultBreakdown', () => {
  it('counts each result type independently per package', () => {
    const result = perPackageResultBreakdown([
      {
        name: 'Package A',
        steps: [
          { result: 'passed' },
          { result: 'passed' },
          { result: 'passed_with_minor' },
          { result: 'failed' },
          { result: 'na' },
          { result: null },
        ],
      },
    ]);
    expect(result).toEqual([
      { packageName: 'Package A', passed: 2, passedWithMinor: 1, failed: 1, na: 1, notTested: 1 },
    ]);
  });

  it('returns all zeros for an empty steps array', () => {
    const result = perPackageResultBreakdown([{ name: 'Empty', steps: [] }]);
    expect(result).toEqual([{ packageName: 'Empty', passed: 0, passedWithMinor: 0, failed: 0, na: 0, notTested: 0 }]);
  });

  it('computes multiple packages independently', () => {
    const result = perPackageResultBreakdown([
      { name: 'A', steps: [{ result: 'passed' }] },
      { name: 'B', steps: [{ result: 'failed' }] },
    ]);
    expect(result).toEqual([
      { packageName: 'A', passed: 1, passedWithMinor: 0, failed: 0, na: 0, notTested: 0 },
      { packageName: 'B', passed: 0, passedWithMinor: 0, failed: 1, na: 0, notTested: 0 },
    ]);
  });
});
