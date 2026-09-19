# Testing Lab (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Testing Lab" tab: one sub-tab per uploaded test package, a table mirroring the source spreadsheet with an editable result per step, per-package KPIs, and a shortcut into ticket creation from a failed/minor step.

**Architecture:** No new database migration — this reads and writes the exact schema Sub-project A already created. One new Server Action (`getTestPackageDetail`), one new pure KPI module, a new route with a couple of small presentational components, and one new optional prop on the existing `NewIssueForm`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase, Tailwind, Tabler Icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-testing-lab-design.md`

## Global Constraints

- No new npm dependency, no new migration.
- Every mutation goes through an existing Server Action (`updateTestStepResult`, already built in Sub-project A) — nothing in this plan adds a new mutation.
- Only pure logic under `lib/` gets a Vitest unit test in this repo; Server Actions and components are verified via `tsc --noEmit` / `npm run build` only — no `*.test.tsx` file exists anywhere in this repo, and this plan doesn't start one.
- Reuse existing components where they already do the job: `components/dashboard/StatTile.tsx` for KPI tiles (do not create a new KPI-tile component).
- Match existing code style exactly: Tailwind classes, Tabler Icons with `stroke={1.5}`, the dashboard's `?phase=`-style query-param tab pattern, Board.tsx's optimistic-update-with-revert-on-error pattern for the result dropdown.

---

### Task 1: Navigation — add the Testing Lab nav item

**Files:**
- Modify: `lib/navSections.ts`
- Modify: `components/Sidebar.tsx`
- Modify: `app/(app)/[engagementId]/layout.tsx`

**Interfaces:**
- Produces: `NavSectionKey` includes `'testing-lab'`; `Sidebar` takes a new `testCasesEnabled: boolean` prop.

- [ ] **Step 1: Add `'testing-lab'` to `lib/navSections.ts`**

Current file:
```ts
export type NavSectionKey = 'board' | 'list' | 'dashboard' | 'settings';

export const NAV_SECTIONS: { key: NavSectionKey; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: 'Settings' },
];
```
Change to:
```ts
export type NavSectionKey = 'board' | 'list' | 'dashboard' | 'testing-lab' | 'settings';

export const NAV_SECTIONS: { key: NavSectionKey; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'testing-lab', label: 'Testing Lab' },
  { key: 'settings', label: 'Settings' },
];
```
`activeNavSection` needs no change — it's generic over whatever's in `NAV_SECTIONS`.

- [ ] **Step 2: Add the icon and the flag-based filter to `components/Sidebar.tsx`**

Add `IconClipboardCheck` to the existing `@tabler/icons-react` import line, and add it to the `ICONS` map:
```ts
const ICONS: Record<NavSectionKey, Icon> = {
  board: IconLayoutKanban,
  list: IconList,
  dashboard: IconChartLine,
  'testing-lab': IconClipboardCheck,
  settings: IconSettings,
};
```
Add a `testCasesEnabled: boolean` prop to the component's signature (alongside the existing `engagementId`/`isProm`), and change the section-filtering line from:
```ts
const sections = isProm ? NAV_SECTIONS : NAV_SECTIONS.filter((s) => s.key !== 'settings');
```
to:
```ts
const sections = NAV_SECTIONS.filter(
  (s) => (s.key !== 'settings' || isProm) && (s.key !== 'testing-lab' || testCasesEnabled),
);
```

- [ ] **Step 3: Pass the flag from the layout**

In `app/(app)/[engagementId]/layout.tsx`, change:
```tsx
<Sidebar engagementId={engagement.id} isProm={session.profile.is_prometeia} />
```
to:
```tsx
<Sidebar
  engagementId={engagement.id}
  isProm={session.profile.is_prometeia}
  testCasesEnabled={engagement.test_cases_enabled}
/>
```
(`engagement` here is already the full `getEngagement()` result, which already includes `test_cases_enabled` — no new fetch needed.)

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add lib/navSections.ts components/Sidebar.tsx "app/(app)/[engagementId]/layout.tsx"
git commit -m "feat: add Testing Lab nav item, shown when test cases are enabled"
```

---

### Task 2: Pure KPI logic (TDD)

**Files:**
- Create: `lib/testPackageKpi.ts`
- Test: `lib/testPackageKpi.test.ts`

**Interfaces:**
- Consumes: `TestResult` from `lib/types.ts` (already exists, from Sub-project A).
- Produces: `TestPackageKpis` type, `testPackageKpis(steps: { result: TestResult | null }[]): TestPackageKpis` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `lib/testPackageKpi.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { testPackageKpis } from './testPackageKpi';

describe('testPackageKpis', () => {
  it('computes totals and percentages for a mix of results', () => {
    const kpis = testPackageKpis([
      { result: 'passed' },
      { result: 'passed_with_minor' },
      { result: 'failed' },
      { result: 'na' },
      { result: null },
      { result: null },
    ]);
    expect(kpis.total).toBe(6);
    expect(kpis.testedCount).toBe(4);
    expect(kpis.testedPercent).toBe(66.7);
    expect(kpis.failedCount).toBe(1);
    expect(kpis.failedPercent).toBe(16.7);
    expect(kpis.toBeTestedCount).toBe(2);
    expect(kpis.toBeTestedPercent).toBe(33.3);
  });

  it('reports 0% tested and 100% to be tested when nothing has been tested', () => {
    const kpis = testPackageKpis([{ result: null }, { result: null }]);
    expect(kpis.testedPercent).toBe(0);
    expect(kpis.toBeTestedPercent).toBe(100);
  });

  it('reports 100% tested and 0% to be tested when everything has a result', () => {
    const kpis = testPackageKpis([{ result: 'passed' }, { result: 'na' }]);
    expect(kpis.testedPercent).toBe(100);
    expect(kpis.toBeTestedPercent).toBe(0);
  });

  it('returns all zeros for an empty step list without dividing by zero', () => {
    const kpis = testPackageKpis([]);
    expect(kpis).toEqual({
      total: 0,
      testedCount: 0,
      testedPercent: 0,
      failedCount: 0,
      failedPercent: 0,
      toBeTestedCount: 0,
      toBeTestedPercent: 0,
    });
  });

  it('rounds percentages to one decimal place', () => {
    const kpis = testPackageKpis([{ result: 'passed' }, { result: null }, { result: null }]);
    expect(kpis.testedPercent).toBe(33.3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/testPackageKpi.test.ts`
Expected: FAIL — `Cannot find module './testPackageKpi'`.

- [ ] **Step 3: Write the implementation**

Create `lib/testPackageKpi.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/testPackageKpi.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add lib/testPackageKpi.ts lib/testPackageKpi.test.ts
git commit -m "feat: add pure KPI calculation for test packages"
```

---

### Task 3: Server Action — `getTestPackageDetail`

**Files:**
- Modify: `app/actions/testPackages.ts`

**Interfaces:**
- Produces: `TestPackageStepDetail` type, `TestPackageDetail` type, `getTestPackageDetail(packageId: string): Promise<TestPackageDetail>` — consumed by Task 5 (both the page and the view).

- [ ] **Step 1: Add the new types and function**

In `app/actions/testPackages.ts`, add this after the existing `listTestPackages` function (before `updateTestStepResult`):

```ts
export type TestPackageStepDetail = {
  id: string;
  stepNumber: number;
  stepName: string;
  stepDescription: string;
  expectedOutcome: string;
  result: TestResult | null;
};

export type TestPackageDetail = {
  id: string;
  name: string;
  steps: TestPackageStepDetail[];
};

export async function getTestPackageDetail(packageId: string): Promise<TestPackageDetail> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select(
      'id, name, test_package_steps(id, step_number, step_name, step_description, expected_outcome, result)',
    )
    .eq('id', packageId)
    .single();
  if (error) throw error;
  const row = data as unknown as {
    id: string;
    name: string;
    test_package_steps: {
      id: string;
      step_number: number;
      step_name: string;
      step_description: string;
      expected_outcome: string;
      result: TestResult | null;
    }[];
  };
  const steps = [...row.test_package_steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => ({
      id: s.id,
      stepNumber: s.step_number,
      stepName: s.step_name,
      stepDescription: s.step_description,
      expectedOutcome: s.expected_outcome,
      result: s.result,
    }));
  return { id: row.id, name: row.name, steps };
}
```

No `requireProm()`/`requireNonProm()` guard — any engagement member can call this, matching the existing `test_package_steps_select` RLS policy (any member can read).

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add app/actions/testPackages.ts
git commit -m "feat: add getTestPackageDetail for the Testing Lab view"
```

---

### Task 4: `NewIssueForm` — optional pre-filled test case package

**Files:**
- Modify: `components/issues/NewIssueForm.tsx`

**Interfaces:**
- Produces: `NewIssueForm` accepts a new optional prop `initialTestCasePackage?: string`, defaulting to today's exact behavior when omitted.

- [ ] **Step 1: Add the prop**

Add `initialTestCasePackage?: string;` to the props type (alongside the existing `testCasesEnabled`/`testCaseStepOptions`), and add `initialTestCasePackage` to the destructure.

Change:
```ts
const [testCasePackage, setTestCasePackage] = useState(testCasesEnabled ? '' : (testCasePackages[0] ?? ''));
```
to:
```ts
const [testCasePackage, setTestCasePackage] = useState(
  initialTestCasePackage ?? (testCasesEnabled ? '' : (testCasePackages[0] ?? '')),
);
```

Nothing else in this file changes — every existing caller (`NewIssueModal`) omits the new prop, so `initialTestCasePackage` is `undefined` and behavior is unchanged.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add components/issues/NewIssueForm.tsx
git commit -m "feat: let NewIssueForm start with a pre-filled test case package"
```

---

### Task 5: Page, package tabs, result badge, and the interactive view

This task is deliberately not split further even though it produces five files — `page.tsx` imports `TestPackageView`, so no smaller slice of this task would produce a build that actually compiles. Right-sizing a task means "a reviewer could approve this slice on its own"; a page that imports a component which doesn't exist yet fails that test, so all five files land together, verified together, in one commit.

**Files:**
- Create: `app/(app)/[engagementId]/testing-lab/page.tsx`
- Create: `components/testinglab/PackageTabs.tsx`
- Create: `components/testinglab/ResultBadge.tsx`
- Create: `components/testinglab/TestPackageView.tsx`

**Interfaces:**
- Consumes: `listTestPackages`, `getTestPackageDetail`, `updateTestStepResult`, `TestPackageSummary`, `TestPackageDetail`, `TestCaseStepOption` from `app/actions/testPackages.ts` (Task 3, Sub-project A); `listPrometeiaTeam`, `getEngagement`, `TeamMember` from `lib/data/engagements.ts`; `testPackageKpis` from `lib/testPackageKpi.ts` (Task 2); `NewIssueForm` (Task 4's new `initialTestCasePackage` prop) from `components/issues/NewIssueForm.tsx`; `StatTile` from `components/dashboard/StatTile.tsx` (existing, reused as-is); `TEST_RESULTS`, `TEST_RESULT_LABELS`, `TestResult` from `lib/types.ts`.
- Produces: the `/[engagementId]/testing-lab` route; `<PackageTabs engagementId packages: TestPackageSummary[] activePackageId: string | null />`; `<ResultBadge result: TestResult | null />`; `<TestPackageView engagementId detail isProm modules teamMembers testCasesEnabled testCaseStepOptions />`.

- [ ] **Step 1: Write `ResultBadge.tsx`**

Create `components/testinglab/ResultBadge.tsx`:
```tsx
import { TEST_RESULT_LABELS, type TestResult } from '@/lib/types';

const STYLES: Record<'untested' | TestResult, string> = {
  untested: 'bg-slate-100 text-slate-700',
  passed: 'bg-green-100 text-green-800',
  passed_with_minor: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  na: 'bg-slate-100 text-slate-700',
};

export function ResultBadge({ result }: { result: TestResult | null }) {
  const label = result ? TEST_RESULT_LABELS[result] : 'Not tested';
  const styleKey = result ?? 'untested';
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[styleKey]}`}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Write `PackageTabs.tsx`**

Create `components/testinglab/PackageTabs.tsx`:
```tsx
import Link from 'next/link';
import type { TestPackageSummary } from '@/app/actions/testPackages';

export function PackageTabs({
  engagementId,
  packages,
  activePackageId,
}: {
  engagementId: string;
  packages: TestPackageSummary[];
  activePackageId: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-hairline pb-2">
      {packages.map((pkg) => (
        <Link
          key={pkg.id}
          href={`/${engagementId}/testing-lab?package=${pkg.id}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            pkg.id === activePackageId
              ? 'bg-brand-blue text-white'
              : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
          }`}
        >
          {pkg.name}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

Create `app/(app)/[engagementId]/testing-lab/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listPrometeiaTeam } from '@/lib/data/engagements';
import { getTestPackageDetail, listTestCaseStepOptions, listTestPackages } from '@/app/actions/testPackages';
import { PackageTabs } from '@/components/testinglab/PackageTabs';
import { TestPackageView } from '@/components/testinglab/TestPackageView';

export default async function TestingLabPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { package?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagement = await getEngagement(params.engagementId);
  if (!engagement) redirect('/');
  if (!engagement.test_cases_enabled) redirect(`/${params.engagementId}/board`);

  const [packages, teamMembers, testCaseStepOptions] = await Promise.all([
    listTestPackages(params.engagementId),
    listPrometeiaTeam(params.engagementId),
    listTestCaseStepOptions(params.engagementId),
  ]);

  if (packages.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          No test packages uploaded yet — ask Prometeia to upload one in Settings.
        </p>
      </div>
    );
  }

  const activePackageId =
    searchParams.package && packages.some((p) => p.id === searchParams.package)
      ? searchParams.package
      : packages[0].id;

  const detail = await getTestPackageDetail(activePackageId);

  return (
    <div className="flex flex-col gap-4">
      <PackageTabs engagementId={params.engagementId} packages={packages} activePackageId={activePackageId} />
      <TestPackageView
        key={activePackageId}
        engagementId={params.engagementId}
        detail={detail}
        isProm={session.profile.is_prometeia}
        modules={engagement.modules}
        teamMembers={teamMembers}
        testCasesEnabled={engagement.test_cases_enabled}
        testCaseStepOptions={testCaseStepOptions}
      />
    </div>
  );
}
```

The `key={activePackageId}` forces `TestPackageView` to fully remount (resetting its internal state) whenever the active package tab changes, matching this codebase's need to never let a client component's `useState` silently go stale when the server hands it fresh data for a different entity.

- [ ] **Step 4: Write `TestPackageView.tsx`**

Create `components/testinglab/TestPackageView.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import {
  updateTestStepResult,
  type TestCaseStepOption,
  type TestPackageDetail,
} from '@/app/actions/testPackages';
import { NewIssueForm } from '@/components/issues/NewIssueForm';
import { StatTile } from '@/components/dashboard/StatTile';
import { testPackageKpis } from '@/lib/testPackageKpi';
import { TEST_RESULTS, TEST_RESULT_LABELS, type TestResult } from '@/lib/types';
import type { TeamMember } from '@/lib/data/engagements';
import { ResultBadge } from './ResultBadge';

export function TestPackageView({
  engagementId,
  detail,
  isProm,
  modules,
  teamMembers,
  testCasesEnabled,
  testCaseStepOptions,
}: {
  engagementId: string;
  detail: TestPackageDetail;
  isProm: boolean;
  modules: string[];
  teamMembers: TeamMember[];
  testCasesEnabled: boolean;
  testCaseStepOptions: TestCaseStepOption[];
}) {
  const [steps, setSteps] = useState(detail.steps);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticketStepName, setTicketStepName] = useState<string | null>(null);

  const kpis = testPackageKpis(steps);

  async function handleResultChange(stepId: string, result: TestResult | null) {
    const previous = steps;
    setPendingId(stepId);
    setError(null);
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, result } : s)));
    try {
      await updateTestStepResult(stepId, result);
    } catch (err) {
      setSteps(previous);
      setError(err instanceof Error ? err.message : 'Could not save this result.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total tests" value={String(kpis.total)} />
        <StatTile label="% tested" value={`${kpis.testedPercent}%`} />
        <StatTile label="% failed" value={`${kpis.failedPercent}%`} />
        <StatTile label="% to be tested" value={`${kpis.toBeTestedPercent}%`} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-hairline text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Step</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Expected outcome</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id} className="border-b border-hairline/60 align-top">
                <td className="px-3 py-2 font-mono text-ink-soft">{step.stepNumber}</td>
                <td className="px-3 py-2 font-medium text-ink">{step.stepName}</td>
                <td className="max-w-md whitespace-pre-wrap px-3 py-2 text-ink-soft">{step.stepDescription}</td>
                <td className="max-w-xs whitespace-pre-wrap px-3 py-2 text-ink-soft">{step.expectedOutcome}</td>
                <td className="px-3 py-2">
                  {isProm ? (
                    <ResultBadge result={step.result} />
                  ) : (
                    <select
                      value={step.result ?? ''}
                      disabled={pendingId === step.id}
                      onChange={(e) => handleResultChange(step.id, (e.target.value || null) as TestResult | null)}
                      className="rounded-md border border-ink-soft/30 px-2 py-1 text-xs font-normal"
                    >
                      <option value="">Not tested</option>
                      {TEST_RESULTS.map((r) => (
                        <option key={r} value={r}>
                          {TEST_RESULT_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  {(step.result === 'failed' || step.result === 'passed_with_minor') && (
                    <button
                      type="button"
                      onClick={() => setTicketStepName(step.stepName)}
                      className="flex items-center gap-1 whitespace-nowrap rounded-md bg-brand-blue px-2 py-1 text-xs font-bold text-white hover:bg-primary-active"
                    >
                      <IconPlus className="h-3.5 w-3.5" stroke={1.5} />
                      Open ticket
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ticketStepName && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setTicketStepName(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-ink">New ticket</h2>
              <button
                type="button"
                onClick={() => setTicketStepName(null)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-primary-soft hover:text-ink"
                aria-label="Close"
              >
                <IconX className="h-4 w-4" stroke={1.5} />
              </button>
            </div>
            <NewIssueForm
              engagementId={engagementId}
              modules={modules}
              testCasePackages={[]}
              testCasesEnabled={testCasesEnabled}
              testCaseStepOptions={testCaseStepOptions}
              initialTestCasePackage={ticketStepName}
              teamMembers={teamMembers}
              onCreated={() => setTicketStepName(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

Notes for the implementer:
- `testCasePackages={[]}` is deliberate, not a placeholder — `NewIssueForm` only reads that prop when `testCasesEnabled` is false, which is never true on this page (the page redirects away otherwise), so this branch of `NewIssueForm` is dead code on this call site and an empty array is the correct, honest value to pass.
- The result `<select>`'s "Not tested" option has `value=""`, matching `step.result ?? ''` — this mirrors how `NewIssueForm`'s own "No module"/"No test case package" empty options already work in this codebase.
- The modal chrome (the two nested `<div>`s with `fixed inset-0`/backdrop-click-to-close) is a deliberate copy of `NewIssueModal.tsx`'s existing pattern, not a shared abstraction — see the spec's Decision 6 for why.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add "app/(app)/[engagementId]/testing-lab/page.tsx" components/testinglab/PackageTabs.tsx components/testinglab/ResultBadge.tsx components/testinglab/TestPackageView.tsx
git commit -m "feat: add the Testing Lab page, tabs, result table, and open-ticket shortcut"
```

## Final Steps

- [ ] Whole-branch review (fresh context, most capable available model) against this plan and the spec before merging.
- [ ] Merge to `main`, sync `master` — following this repo's established convention. Ask before pushing, matching how Sub-project A's merge was handled (local merge first, push only once told to).
- [ ] Report to the user: what shipped, that no new migration is needed for this sub-project (it reuses Sub-project A's schema), and the same standing caveat as every feature this session — verified via `tsc`/tests/build only, no live Supabase-backed environment here to click through the Testing Lab tab by hand.
