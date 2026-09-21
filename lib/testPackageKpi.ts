import type { TestResult } from './types';

/**
 * Computes the small set of top-line KPI tiles (total/tested/failed/to-be-
 * tested counts and percentages) shown for a test package or for the whole
 * Testing Insights dashboard view. Consumed by
 * app/(app)/[engagementId]/dashboard/page.tsx and
 * components/testinglab/TestPackageView.tsx.
 *
 * Like lib/testPackageDashboard.ts, this is phase-agnostic: callers must
 * already have picked one phase's `result` per step (SIT or UAT — see
 * migration 0022's independent `sit_result`/`uat_result` columns) before
 * calling `testPackageKpis`; this function has no notion of phase itself.
 */
export type TestPackageKpis = {
  total: number;
  testedCount: number;
  testedPercent: number;
  failedCount: number;
  failedPercent: number;
  toBeTestedCount: number;
  toBeTestedPercent: number;
};

function percent(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function testPackageKpis(steps: { result: TestResult | null }[]): TestPackageKpis {
  const total = steps.length;
  const testedCount = steps.filter((s) => s.result !== null).length;
  const failedCount = steps.filter((s) => s.result === 'failed').length;
  const toBeTestedCount = total - testedCount;
  return {
    total,
    testedCount,
    testedPercent: percent(testedCount, total),
    failedCount,
    failedPercent: percent(failedCount, total),
    toBeTestedCount,
    toBeTestedPercent: percent(toBeTestedCount, total),
  };
}
