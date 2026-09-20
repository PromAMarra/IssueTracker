# Testing Insights (Sub-project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Testing Insights" view to the existing Dashboard page — cross-package KPIs, a tested-vs-target-pace trend chart per configured SIT/UAT period, and a per-package results breakdown.

**Architecture:** No new database migration. One new Server Action (a lighter projection than Sub-project B's `getTestPackageDetail`), one new pure-logic module, two new chart components, and a view-switcher added to the existing dashboard page with the current content wrapped unchanged behind a conditional.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase, Recharts, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-testing-insights-design.md`

## Global Constraints

- No new npm dependency (Recharts is already used by every existing dashboard chart), no new migration.
- Only pure logic under `lib/` gets a Vitest unit test; components and the page are verified via `tsc --noEmit` / `npm run build` only.
- The existing "Issue Insights" (today's dashboard) JSX and logic must be wrapped unchanged, not rewritten — this is a large, already-reviewed page; minimize the diff against it.
- Pure functions that depend on the current date take `now: Date` as an explicit parameter rather than calling `new Date()` internally, matching `lib/kpi.ts`'s existing `dailyDefects` convention.
- Match existing chart conventions exactly: `components/dashboard/ThroughputChart.tsx` and `components/dashboard/DailyDefectsChart.tsx` for structure (title, `ResponsiveContainer`, axis/grid styling), `components/dashboard/OrgVolumeChart.tsx` for color values already in use in this app's charts.

---

### Task 1: Server Action — `listTestPackagesWithResults`

**Files:**
- Modify: `app/actions/testPackages.ts`

**Interfaces:**
- Produces: `TestPackageWithResults` type, `listTestPackagesWithResults(engagementId: string): Promise<TestPackageWithResults[]>` — consumed by Task 4.

- [ ] **Step 1: Read the current file, then add the new type and function**

Read `app/actions/testPackages.ts` in full first. Add this at the end of the file, after `listTestCaseStepOptions`:

```ts
export type TestPackageWithResults = {
  id: string;
  name: string;
  steps: { result: TestResult | null; resultUpdatedAt: string | null }[];
};

export async function listTestPackagesWithResults(engagementId: string): Promise<TestPackageWithResults[]> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select('id, name, test_package_steps(result, result_updated_at)')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      name: string;
      test_package_steps: { result: TestResult | null; result_updated_at: string | null }[];
    }[]
  ).map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    steps: pkg.test_package_steps.map((s) => ({ result: s.result, resultUpdatedAt: s.result_updated_at })),
  }));
}
```

No `requireProm()`/`requireNonProm()` guard — any engagement member can call this, matching `test_package_steps_select`'s "any member" RLS scope, same as every other read in this file.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add app/actions/testPackages.ts
git commit -m "feat: add listTestPackagesWithResults for dashboard aggregation"
```

---

### Task 2: Pure logic — trend/target and per-package breakdown (TDD)

**Files:**
- Create: `lib/testPackageDashboard.ts`
- Test: `lib/testPackageDashboard.test.ts`

**Interfaces:**
- Consumes: `TestResult` from `lib/types.ts`.
- Produces: `TestPackageStepResult`, `TestedTrendPoint`, `testedTrend(steps, startDate, endDate, now): TestedTrendPoint[]`, `PackageResultBreakdown`, `perPackageResultBreakdown(packages): PackageResultBreakdown[]` — consumed by Task 3 (types) and Task 4 (both functions).

- [ ] **Step 1: Write the failing tests**

Create `lib/testPackageDashboard.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/testPackageDashboard.test.ts`
Expected: FAIL — `Cannot find module './testPackageDashboard'`.

- [ ] **Step 3: Write the implementation**

Create `lib/testPackageDashboard.ts`:

```ts
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
```

Note: when `startDate` is after `endDate`, the `while` loop never executes, `days` stays `[]`, and `.map()` returns `[]` — this is why the misconfigured-period test expects an empty array rather than needing a defensive zero-duration guard inside the callback (that code would be unreachable, since a non-empty `days` array is only ever produced when `periodDurationMs` is already positive).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/testPackageDashboard.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add lib/testPackageDashboard.ts lib/testPackageDashboard.test.ts
git commit -m "feat: add pure trend/target and per-package breakdown logic"
```

---

### Task 3: Chart components

**Files:**
- Create: `components/dashboard/TestedTrendChart.tsx`
- Create: `components/dashboard/PackageResultsChart.tsx`

**Interfaces:**
- Consumes: `TestedTrendPoint`, `PackageResultBreakdown` from `lib/testPackageDashboard.ts` (Task 2).
- Produces: `<TestedTrendChart title={string} points={TestedTrendPoint[]} />`, `<PackageResultsChart data={PackageResultBreakdown[]} />` — both consumed by Task 4.

- [ ] **Step 1: Write `TestedTrendChart.tsx`**

Create `components/dashboard/TestedTrendChart.tsx`:

```tsx
'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TestedTrendPoint } from '@/lib/testPackageDashboard';

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

export function TestedTrendChart({ title, points }: { title: string; points: TestedTrendPoint[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(v) => formatDate(String(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="cumulativeTested"
            name="Tested"
            stroke="#0026FF"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="targetCumulative"
            name="Target pace"
            stroke="#565F78"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Write `PackageResultsChart.tsx`**

Create `components/dashboard/PackageResultsChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PackageResultBreakdown } from '@/lib/testPackageDashboard';

export function PackageResultsChart({ data }: { data: PackageResultBreakdown[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Results by package</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="packageName"
            tick={{ fontSize: 10, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            height={60}
            interval={0}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="passed" name="Passed" stackId="results" fill="#00DC78" />
          <Bar dataKey="passedWithMinor" name="Passed with minor" stackId="results" fill="#FF7D00" />
          <Bar dataKey="failed" name="Failed" stackId="results" fill="#FF0D21" />
          <Bar dataKey="na" name="N/A" stackId="results" fill="#94A3B8" />
          <Bar dataKey="notTested" name="Not tested" stackId="results" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add components/dashboard/TestedTrendChart.tsx components/dashboard/PackageResultsChart.tsx
git commit -m "feat: add TestedTrendChart and PackageResultsChart components"
```

---

### Task 4: Dashboard page — view switcher and Testing Insights branch

**Files:**
- Modify: `app/(app)/[engagementId]/dashboard/page.tsx`

**Interfaces:**
- Consumes: `listTestPackagesWithResults` (Task 1); `testedTrend`, `perPackageResultBreakdown` (Task 2); `TestedTrendChart`, `PackageResultsChart` (Task 3); `testPackageKpis` from `lib/testPackageKpi.ts` (Sub-project B, existing).
- Produces: the `?view=issues|testing` query param on the dashboard route.

- [ ] **Step 1: Read the current file in full**

Read `app/(app)/[engagementId]/dashboard/page.tsx` in full before editing — this task adds to it without rewriting the existing "Issue Insights" logic or JSX.

- [ ] **Step 2: Add the new imports**

Add these imports alongside the existing ones:

```ts
import { listTestPackagesWithResults } from '@/app/actions/testPackages';
import { testPackageKpis } from '@/lib/testPackageKpi';
import { perPackageResultBreakdown, testedTrend } from '@/lib/testPackageDashboard';
import { TestedTrendChart } from '@/components/dashboard/TestedTrendChart';
import { PackageResultsChart } from '@/components/dashboard/PackageResultsChart';
```

- [ ] **Step 3: Widen the `searchParams` type**

Change:
```ts
searchParams: { phase?: string };
```
to:
```ts
searchParams: { phase?: string; view?: string; testPackage?: string };
```

- [ ] **Step 4: Compute the view and the Testing Insights data**

Right after the existing `const engagement = ...` / `if (!engagement) redirect('/');` block (keep every existing line — `phase`, `issues`, `issueIds`, `history`, `openCount`, `closedCount`, `reopen`, `now`, `statusDist`, `priorityDist`, `timeToClose`, `throughput`, `moduleVol`, `orgVol`, `aging`, `timeInStatus`, `sitPeriod`, `uatPeriod`, `sitDaily`, `uatDaily`, `phaseLink`, `phaseClass` — all unchanged, in their current order), add these new computations right after the existing `const phaseClass = ...` line and before the `return`:

```ts
  const view = searchParams.view === 'testing' && engagement.test_cases_enabled ? 'testing' : 'issues';
  const testPackages = view === 'testing' ? await listTestPackagesWithResults(params.engagementId) : [];
  const testPackageFilter =
    searchParams.testPackage && testPackages.some((p) => p.id === searchParams.testPackage)
      ? searchParams.testPackage
      : null;
  const filteredTestPackages = testPackageFilter
    ? testPackages.filter((p) => p.id === testPackageFilter)
    : testPackages;
  const allTestSteps = filteredTestPackages.flatMap((p) => p.steps);
  const testKpis = testPackageKpis(allTestSteps);
  const testSitTrend = sitPeriod ? testedTrend(allTestSteps, sitPeriod.start, sitPeriod.end, now) : null;
  const testUatTrend = uatPeriod ? testedTrend(allTestSteps, uatPeriod.start, uatPeriod.end, now) : null;
  const packageBreakdown = perPackageResultBreakdown(testPackages);

  const viewLink = (value: 'issues' | 'testing') => (value === 'issues' ? '?' : '?view=testing');
  const viewClass = (value: 'issues' | 'testing') =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      view === value ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
    }`;
  const testPackageLink = (id: string | null) => (id ? `?view=testing&testPackage=${id}` : '?view=testing');
  const testPackageClass = (id: string | null) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      testPackageFilter === id ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
    }`;
```

`packageBreakdown` deliberately uses `testPackages` (every package), not `filteredTestPackages` — the per-package comparison chart always shows all packages side by side regardless of the KPI filter, since comparing packages is the whole point of that chart.

- [ ] **Step 5: Wrap the existing content and add the new branch**

The current `return` statement is:
```tsx
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Link href={phaseLink(null)} className={phaseClass(null)}>
            All
          </Link>
          {engagement.sit_expected && (
            <Link href={phaseLink('sit')} className={phaseClass('sit')}>
              SIT
            </Link>
          )}
          <Link href={phaseLink('uat')} className={phaseClass('uat')}>
            UAT
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ExportDashboardButton
            engagementName={engagement.name}
            statusDist={statusDist}
            priorityDist={priorityDist}
            timeToClose={timeToClose}
            timeInStatus={timeInStatus}
            throughput={throughput}
            aging={aging}
            moduleVol={moduleVol}
            orgVol={orgVol}
            sitDaily={sitDaily}
            uatDaily={uatDaily}
          />
          <ExportPdfButton targetId="dashboard-export-root" engagementName={engagement.name} />
        </div>
      </div>
      <div id="dashboard-export-root" className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Total issues" value={String(issues.length)} />
          <StatTile label="Open" value={String(openCount)} />
          <StatTile label="Closed" value={String(closedCount)} />
          <StatTile
            label="Reopen rate"
            value={`${reopen.ratePercent.toFixed(0)}%`}
            sublabel={`${reopen.reopenedCount} of ${reopen.everClosedCount} closed`}
          />
        </div>
        <DailyDefectsChart issues={issues} sitPeriod={sitPeriod} uatPeriod={uatPeriod} forcedPhase={phase} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatusDistributionChart distribution={statusDist} />
          <PriorityDistributionChart distribution={priorityDist} />
        </div>
        <TimeToCloseChart rows={timeToClose} />
        <TimeInStatusTable rows={timeInStatus} />
        <ThroughputChart buckets={throughput} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ModuleVolumeChart data={moduleVol} />
          <OrgVolumeChart data={orgVol} />
        </div>
        <AgingReportTable rows={aging} />
      </div>
    </div>
  );
```

Change it to (the entire block from the original `<div className="flex items-center justify-between gap-2">` through the matching `</div>` that closes `dashboard-export-root`, i.e. everything that used to be inside the outer `<div className="flex flex-col gap-6">`, is now wrapped in `{view === 'issues' && (...)}`, completely unchanged internally; a new top row and a new `{view === 'testing' && (...)}` branch are added as siblings):

```tsx
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 border-b border-hairline pb-3">
        <Link href={viewLink('issues')} className={viewClass('issues')}>
          Issue Insights
        </Link>
        {engagement.test_cases_enabled && (
          <Link href={viewLink('testing')} className={viewClass('testing')}>
            Testing Insights
          </Link>
        )}
      </div>

      {view === 'issues' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Link href={phaseLink(null)} className={phaseClass(null)}>
                All
              </Link>
              {engagement.sit_expected && (
                <Link href={phaseLink('sit')} className={phaseClass('sit')}>
                  SIT
                </Link>
              )}
              <Link href={phaseLink('uat')} className={phaseClass('uat')}>
                UAT
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <ExportDashboardButton
                engagementName={engagement.name}
                statusDist={statusDist}
                priorityDist={priorityDist}
                timeToClose={timeToClose}
                timeInStatus={timeInStatus}
                throughput={throughput}
                aging={aging}
                moduleVol={moduleVol}
                orgVol={orgVol}
                sitDaily={sitDaily}
                uatDaily={uatDaily}
              />
              <ExportPdfButton targetId="dashboard-export-root" engagementName={engagement.name} />
            </div>
          </div>
          <div id="dashboard-export-root" className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Total issues" value={String(issues.length)} />
              <StatTile label="Open" value={String(openCount)} />
              <StatTile label="Closed" value={String(closedCount)} />
              <StatTile
                label="Reopen rate"
                value={`${reopen.ratePercent.toFixed(0)}%`}
                sublabel={`${reopen.reopenedCount} of ${reopen.everClosedCount} closed`}
              />
            </div>
            <DailyDefectsChart issues={issues} sitPeriod={sitPeriod} uatPeriod={uatPeriod} forcedPhase={phase} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <StatusDistributionChart distribution={statusDist} />
              <PriorityDistributionChart distribution={priorityDist} />
            </div>
            <TimeToCloseChart rows={timeToClose} />
            <TimeInStatusTable rows={timeInStatus} />
            <ThroughputChart buckets={throughput} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ModuleVolumeChart data={moduleVol} />
              <OrgVolumeChart data={orgVol} />
            </div>
            <AgingReportTable rows={aging} />
          </div>
        </>
      )}

      {view === 'testing' && (
        <div className="flex flex-col gap-6">
          {testPackages.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No test packages uploaded yet — ask Prometeia to upload one in Settings.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                <Link href={testPackageLink(null)} className={testPackageClass(null)}>
                  All packages
                </Link>
                {testPackages.map((p) => (
                  <Link key={p.id} href={testPackageLink(p.id)} className={testPackageClass(p.id)}>
                    {p.name}
                  </Link>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatTile label="Total tests" value={String(testKpis.total)} />
                <StatTile label="% tested" value={`${testKpis.testedPercent}%`} />
                <StatTile label="% failed" value={`${testKpis.failedPercent}%`} />
                <StatTile label="% to be tested" value={`${testKpis.toBeTestedPercent}%`} />
              </div>
              {!sitPeriod && !uatPeriod ? (
                <div className="rounded-lg border border-hairline bg-white p-4">
                  <h3 className="mb-1 text-sm font-bold text-ink">Tested vs. target pace</h3>
                  <p className="text-sm text-ink-soft">
                    Configure SIT and/or UAT testing period dates in Settings to see this chart.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {testSitTrend && (
                    <TestedTrendChart
                      title={`Tested vs. target pace — SIT (${sitPeriod!.start} to ${sitPeriod!.end})`}
                      points={testSitTrend}
                    />
                  )}
                  {testUatTrend && (
                    <TestedTrendChart
                      title={`Tested vs. target pace — UAT (${uatPeriod!.start} to ${uatPeriod!.end})`}
                      points={testUatTrend}
                    />
                  )}
                </div>
              )}
              <PackageResultsChart data={packageBreakdown} />
            </>
          )}
        </div>
      )}
    </div>
  );
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add "app/(app)/[engagementId]/dashboard/page.tsx"
git commit -m "feat: add Testing Insights view to the dashboard"
```

## Final Steps

- [ ] Whole-branch review (fresh context, most capable available model) against this plan and the spec before merging.
- [ ] Merge to `main`, sync `master`, push both.
- [ ] Report to the user: what shipped, that no new migration is needed (built entirely on Sub-project A's schema), and the same standing caveat as every feature this session — verified via `tsc`/tests/build only, no live Supabase-backed environment here to click through the new charts by hand.
