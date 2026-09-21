import type { TestResult } from './types';

/**
 * Pure analytics functions backing the "Testing Insights" dashboard view's
 * trend chart and per-package breakdown chart (see
 * app/(app)/[engagementId]/dashboard/page.tsx, components/dashboard/
 * TestedTrendChart.tsx and PackageResultsChart.tsx). Like lib/kpi.ts, these
 * take already-fetched, already phase-resolved data and return plain data —
 * no Supabase calls, no framework dependencies.
 *
 * `TestPackageStepResult` is intentionally phase-agnostic: since migration
 * 0022 split step results into independent `sit_result`/`uat_result`
 * columns, callers must pick ONE phase's result/updated-at pair per step
 * before calling into this module (see the dashboard page's
 * `toSitResult`/`toUatResult` mappers) — nothing here knows about SIT vs UAT.
 */
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
    // `cumulativeTested` is left null for any day after "now" — the testing
    // period (startDate/endDate) is a configured window that can extend into
    // the future, and there is no real data yet for days that haven't
    // happened, so the actual-progress line should stop rather than flatline
    // at today's count. A step with no `resultUpdatedAt` (tested before this
    // column existed, i.e. legacy data) is conservatively counted as tested
    // on every day, since we have no timestamp to place it more precisely.
    const cumulativeTested =
      day <= todayStr
        ? steps.filter(
            (s) =>
              s.result !== null &&
              (s.resultUpdatedAt === null || new Date(s.resultUpdatedAt).getTime() <= dayEndMs),
          ).length
        : null;
    // Straight-line target: what fraction of the period's elapsed time has
    // passed, applied to the total step count — clamped to 100% once the
    // period has ended, so the target line never implies "more than all
    // steps".
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
