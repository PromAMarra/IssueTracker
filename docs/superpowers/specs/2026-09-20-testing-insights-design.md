# Testing Insights (Sub-project C)

## Goal

Add a "Testing Insights" view to the existing Dashboard page: cross-package
test-execution KPIs, a progress-vs-target trend chart against the SIT/UAT
end date, and a per-package results breakdown — the last of the three
sub-projects for the test-case-tracking feature (A: upload/data foundation,
B: the Testing Lab execution tab, both already merged).

## Non-goals

- Any change to the Testing Lab tab itself (Sub-project B) — this only reads
  the same data.
- Per-step drill-down from a dashboard chart — clicking into a specific
  step's history is out of scope; the Testing Lab tab is where that detail
  already lives.
- Any change to the existing "Issue Insights" content (today's dashboard) —
  Decision 1 renames its label and gives it a sibling view; nothing about
  its charts, data, or behavior changes.

## Decisions

1. **No new nav item.** The Dashboard page gains a top-level view switcher —
   `?view=issues|testing`, default `issues` — using the exact same
   query-param-tab pattern the page already uses for `?phase=`. Two labels:
   "Issue Insights" (today's dashboard, unchanged content) and "Testing
   Insights" (new; only rendered as an option when `engagement.
   test_cases_enabled` is true — for an engagement without test cases,
   `?view=testing` redirects back to `?view=issues`, mirroring how Testing
   Lab redirects to `/board` when visited with the flag off).
2. **No new tables or migration.** One new Server Action,
   `listTestPackagesWithResults`, reads the same `test_packages`/
   `test_package_steps` schema Sub-project A created — just a lighter
   projection (`result` + `result_updated_at` per step, no description/
   expected-outcome text) than Sub-project B's `getTestPackageDetail`, since
   the dashboard aggregates across every package at once rather than
   displaying one package's full detail.
3. **Overall KPIs, with a package filter.** Reuses `testPackageKpis` from
   Sub-project B unchanged — flatten every package's steps for "All
   packages," or one package's steps when a `?testPackage=<id>` filter is
   applied. No new KPI-calculation function needed for this part.
4. **Trend vs. target, one chart per configured testing period.** Rather
   than inventing a new phase-filter control, this mirrors the existing
   `DailyDefectsChart`'s precedent directly: if the engagement has a SIT
   period configured, render one trend chart scoped to it; if it has a UAT
   period configured, render another. (Test steps aren't phase-tagged the
   way issues are via `org`, so there's no sensible way to split "tested
   count" between SIT/UAT the way `DailyDefectsChart` splits defects — both
   charts show the *same* overall tested-count progress, each measured
   against its own period's end date, because "will we finish by the SIT
   deadline" and "will we finish by the UAT deadline" are two genuinely
   different questions when both periods are configured.) Neither period
   configured: a placeholder message, matching `DailyDefectsChart`'s own
   existing placeholder pattern exactly.
   - **Actual line**: cumulative count of steps with a non-null `result`
     whose `result_updated_at` falls on or before each day, capped at
     today (no data point for future days — the line simply stops, which
     `recharts` renders correctly when a data point's value is `null`).
   - **Target line**: a straight reference from `(period start, 0)` to
     `(period end, total step count)` — the pace required to finish
     everything by the deadline. This is the standard "target/burn-up
     line" technique, drawn dashed to distinguish it from the actual line.
5. **Per-package breakdown**: a stacked bar chart, one bar per package,
   segments for `passed` / `passed_with_minor` / `failed` / `na` / not
   tested (five segments — more granular than the three buckets named in
   the original request, since the app already tracks these five distinct
   states via `TestResult` and collapsing them would throw away
   information the rest of the app already surfaces via `ResultBadge`).
6. **New pure logic** in a new file, `lib/testPackageDashboard.ts` (kept
   separate from `lib/testPackageKpi.ts`, which is Sub-project B's
   single-package KPI math, and from `lib/kpi.ts`, which is issue-KPI
   math): `testedTrend(steps, startDate, endDate, now)` for the trend+target
   data, and `perPackageResultBreakdown(packages)` for the stacked-bar data.
   Both take `now: Date` as an explicit parameter rather than calling
   `new Date()` internally, matching `lib/kpi.ts`'s existing `dailyDefects`
   convention (testable, and the one call site — the dashboard page —
   already computes `now` once for its other charts).

## Data flow

```
dashboard/page.tsx (server)
  → (existing) getEngagement, listIssues, listHistoryForEngagement
  → view = searchParams.view === 'testing' && engagement.test_cases_enabled ? 'testing' : 'issues'
  → if view === 'testing':
      listTestPackagesWithResults(engagementId)  [new]
      → filter to one package if ?testPackage=<id>, else flatten all
      → testPackageKpis(steps)                    [Sub-project B, unchanged]
      → testedTrend(steps, sitPeriod, now) / testedTrend(steps, uatPeriod, now)  [new]
      → perPackageResultBreakdown(packages)        [new]
      → renders TestedTrendChart (new) × (1 or 2) + PackageResultsChart (new)
  → if view === 'issues': today's existing dashboard content, unchanged
```

## New Server Action

`app/actions/testPackages.ts` gains:

```ts
export type TestPackageWithResults = {
  id: string;
  name: string;
  steps: { result: TestResult | null; resultUpdatedAt: string | null }[];
};

export async function listTestPackagesWithResults(engagementId: string): Promise<TestPackageWithResults[]>
```

Any engagement member can call this (same "any member" scope as every other
read in this file) — selects `test_packages` joined to
`test_package_steps(result, result_updated_at)`, ordered by `created_at`
ascending (matching `listTestCaseStepOptions`'s existing order).

## New pure logic

`lib/testPackageDashboard.ts` (new):

```ts
import type { TestResult } from './types';

export type TestPackageStepResult = { result: TestResult | null; resultUpdatedAt: string | null };

export type TestedTrendPoint = { date: string; cumulativeTested: number | null; targetCumulative: number };

export function testedTrend(
  steps: TestPackageStepResult[],
  startDate: string,
  endDate: string,
  now: Date,
): TestedTrendPoint[]

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
): PackageResultBreakdown[]
```

`testedTrend` produces one point per calendar day from `startDate` to
`endDate` inclusive (the full period, not capped — unlike `dailyDefects`,
which caps its day range at today because it has no "target" concept to draw
past today). `cumulativeTested` is `null` for any day after `now`, so the
chart's actual-progress line stops at today; `targetCumulative` spans the
whole period linearly from `0` to `steps.length`. A misconfigured period
(`endDate <= startDate`) returns `targetCumulative` as the full total for
every point rather than dividing by a non-positive duration.

## New components

- `components/dashboard/TestedTrendChart.tsx` — one `LineChart` (mirrors
  `ThroughputChart.tsx`'s structure), two lines: "Tested" (solid) and
  "Target pace" (dashed, `strokeDasharray`), labeled with the period name
  (SIT/UAT) and date range in its title, matching `DailyDefectsChart`'s
  title-with-date-range convention.
- `components/dashboard/PackageResultsChart.tsx` — a stacked `BarChart`
  (`Bar` components sharing one `stackId`), one bar per package, five
  segments colored consistently with `components/testinglab/ResultBadge.tsx`'s
  existing color intent (green/amber/red for passed/minor/failed, two
  neutral tones for N/A vs. not-tested).

## Testing plan

- `lib/testPackageDashboard.test.ts` (new): `testedTrend` — a mix of tested
  (with varying `resultUpdatedAt` days) and untested steps produces the
  right cumulative counts per day; the target line is exactly linear
  (spot-check the midpoint of a period is ~50% of total); a day after `now`
  has `cumulativeTested: null`; a misconfigured period (`end <= start`)
  doesn't throw or divide by zero. `perPackageResultBreakdown` — a package
  with a mix of all five states counts each correctly; an empty steps array
  returns all zeros; multiple packages are each computed independently.
- `tsc --noEmit`, `npm test`, `npm run build` clean, as every prior task
  this session.
- No live click-through possible in this sandbox — same standing
  limitation, disclosed the same way.

## Files touched

- `app/actions/testPackages.ts` — add `listTestPackagesWithResults`
- `lib/testPackageDashboard.ts` (new) + `lib/testPackageDashboard.test.ts` (new)
- `components/dashboard/TestedTrendChart.tsx` (new)
- `components/dashboard/PackageResultsChart.tsx` (new)
- `app/(app)/[engagementId]/dashboard/page.tsx` — add the view switcher and
  the Testing Insights branch
