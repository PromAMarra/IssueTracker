import type { TestResult } from './types';

export type TestPackageStepResult = { result: TestResult | null; resultUpdatedAt: string | null };

export type TestedTrendPoint = { date: string; cumulativeTested: number | null; targetCumulative: number };

export function testedTrend(
  steps: TestPackageStepResult[],
  startDate: string,
  endDate: string,
  now: Date,
): TestedTrendPoint[] {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const todayStr = now.toISOString().slice(0, 10);
  const total = steps.length;
  const periodStartMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const periodEndMs = new Date(`${endDate}T23:59:59.999Z`).getTime();
  const periodDurationMs = periodEndMs - periodStartMs;

  return days.map((day) => {
    const dayEndMs = new Date(`${day}T23:59:59.999Z`).getTime();
    const cumulativeTested =
      day <= todayStr
        ? steps.filter(
            (s) =>
              s.result !== null && s.resultUpdatedAt !== null && new Date(s.resultUpdatedAt).getTime() <= dayEndMs,
          ).length
        : null;
    const elapsedMs = Math.min(dayEndMs, periodEndMs) - periodStartMs;
    const targetCumulative = Math.round(total * Math.min(1, elapsedMs / periodDurationMs));
    return { date: day, cumulativeTested, targetCumulative };
  });
}

export type PackageResultBreakdown = {
  packageName: string;
  passed: number;
  passedWithMinor: number;
  failed: number;
  na: number;
  notTested: number;
};

export function perPackageResultBreakdown(
  packages: { name: string; steps: { result: TestResult | null }[] }[],
): PackageResultBreakdown[] {
  return packages.map((pkg) => ({
    packageName: pkg.name,
    passed: pkg.steps.filter((s) => s.result === 'passed').length,
    passedWithMinor: pkg.steps.filter((s) => s.result === 'passed_with_minor').length,
    failed: pkg.steps.filter((s) => s.result === 'failed').length,
    na: pkg.steps.filter((s) => s.result === 'na').length,
    notTested: pkg.steps.filter((s) => s.result === null).length,
  }));
}
