import type { TestResult } from './types';

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
