# Testing Lab (Sub-project B)

## Goal

Give engagement members a dedicated page — "Testing Lab" — for executing the
test packages Prometeia uploads (Sub-project A): one tab per package, a table
mirroring the source spreadsheet with an editable result per step, KPIs
summarizing progress, and a shortcut into ticket creation from a failed step.
Sub-project C (dashboard restructuring, cross-package trend charts) builds on
this afterward.

## Non-goals

- Any dashboard change — that's Sub-project C.
- Editing a step's content (name/description/expected outcome) after upload
  — frozen in Sub-project A's spec, unchanged here.
- Package versioning/replace-in-place — unchanged from Sub-project A.
- A dedicated history/audit log of result changes beyond the existing
  `result_updated_by`/`result_updated_at` columns — no new tracking added.

## Decisions

1. **New nav item**: `'testing-lab'` added to `lib/navSections.ts`'s
   `NavSectionKey`/`NAV_SECTIONS`, shown only when
   `engagement.test_cases_enabled` is true — `Sidebar` gets a new
   `testCasesEnabled: boolean` prop (passed from `layout.tsx`, which already
   fetches `engagement`) and filters `NAV_SECTIONS` the same way it already
   filters out `settings` for non-Prometeia users. `Breadcrumbs` needs no
   change — it already looks up any active section generically via the same
   `NAV_SECTIONS` array.
2. **Route**: `app/(app)/[engagementId]/testing-lab/page.tsx`. If
   `test_cases_enabled` is false for the engagement, redirect to `/board`
   (mirrors Settings' redirect for non-Prometeia — a direct URL visit to a
   feature that isn't enabled for this engagement shouldn't 404, it should
   bounce somewhere useful).
3. **Package tabs**: server-rendered links using a `?package=<id>` query
   param — the same pattern the dashboard already uses for its
   `?phase=sit|uat` tabs, and the board/list use for `?issue=<id>`. No new
   navigation pattern introduced. Defaults to the first package
   (`listTestPackages`'s existing order — newest-first) when no `package` is
   given, or when no packages exist yet a plain "No test packages uploaded
   yet — ask Prometeia to upload one in Settings" message replaces the tabs
   and table entirely.
4. **No new tables or migration.** This sub-project reads and writes the
   exact schema Sub-project A already created (`test_packages`,
   `test_package_steps`, `updateTestStepResult`). One new Server Action is
   added: `getTestPackageDetail`, to fetch one package's full step list for
   the table. No new RLS policy is needed — `test_package_steps_select`
   already allows any engagement member to read.
5. **The result dropdown** auto-saves on change and is Bank/SIT-only,
   exactly matching Sub-project A's already-decided permission split —
   Prometeia sees a read-only badge instead, matching the existing
   Board/List pattern of "editable `<select>` for one side, badge for the
   other." Options: "Not tested" (null) plus the four `TEST_RESULT_LABELS`
   values already defined in `lib/types.ts`.
6. **"+ Open ticket"** appears next to any row whose current result is
   `failed` or `passed_with_minor`, for every user regardless of role (it's
   a shortcut into the existing ticket-creation flow, which already has its
   own permission model — no new restriction here). Clicking it opens the
   same ticket-creation form pre-filled with that step's `step_name` in the
   "Test case package" field. Implementation: rather than modifying the
   existing `NewIssueModal` (which owns its own open/closed state with no
   external trigger), the Testing Lab page renders its own copy of that
   modal's chrome directly — the same choice already made when
   `NewIssueModal` itself was first built, avoiding a shared-abstraction
   refactor for what's a few lines of JSX. `NewIssueForm` gains one new
   optional prop, `initialTestCasePackage?: string`, defaulting to
   `undefined` so every existing caller is unaffected.
7. **KPIs**, computed client-side from the already-fetched step list (no new
   query): Total tests, % tested (non-null result ÷ total), % failed
   (`failed` ÷ total), % to be tested (null result ÷ total). A new pure
   function `testPackageKpis()` in a new file `lib/testPackageKpi.ts` —
   kept separate from `lib/kpi.ts` (which is scoped to issue/ticket KPIs) so
   Sub-project C's cross-package aggregate functions have an obvious home
   to grow into later, without `lib/kpi.ts` absorbing an unrelated domain.

## Data flow

```
testing-lab/page.tsx (server)
  → listTestPackages(engagementId)         [Sub-project A, unchanged]
  → getTestPackageDetail(activePackageId)  [new]
  → listPrometeiaTeam(engagementId)        [existing, for the ticket form]
  → listTestCaseStepOptions(engagementId)  [Sub-project A, for the ticket form's own dropdown]
  → renders PackageTabs (server) + TestPackageView (client)

TestPackageView (client)
  → KPIs rendered via components/dashboard/StatTile.tsx (existing, reused as-is)
  → table of steps, each row:
      - Bank/SIT: <select> → updateTestStepResult(stepId, result) [Sub-project A, unchanged]
      - Prometeia: <ResultBadge>
      - failed/passed_with_minor: "+ Open ticket" → opens a NewIssueForm
        with initialTestCasePackage={step.stepName}
```

## New Server Action

`app/actions/testPackages.ts` gains:

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

export async function getTestPackageDetail(packageId: string): Promise<TestPackageDetail>
```

Selects `test_packages` joined to `test_package_steps` by id, sorts steps by
`step_number` (mirroring `listTestCaseStepOptions`'s existing sort), maps
snake_case DB columns to the camelCase shape above. Any engagement member can
call this — no `requireProm()`/`requireNonProm()` guard, matching the
existing `test_package_steps_select` RLS policy's own "any member" scope.

## New pure logic

`lib/testPackageKpi.ts` (new):

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

export function testPackageKpis(steps: { result: TestResult | null }[]): TestPackageKpis
```

Percentages rounded to one decimal place; a zero-step package (shouldn't
happen post Sub-project A's fix rejecting empty uploads, but the function
itself must not divide by zero) returns all percentages as `0`.

## Testing plan

- `lib/testPackageKpi.test.ts` (new): a package with a mix of all four
  results plus untested steps computes each figure correctly; an
  all-untested package shows 0% tested / 100% to be tested; a zero-step
  input returns zeros without throwing; percentages round to one decimal.
- `tsc --noEmit`, `npm test`, `npm run build` clean, as every prior task
  this session.
- No live click-through possible in this sandbox (no Supabase-backed
  environment) — same standing limitation, disclosed the same way.

## Files touched

- `lib/navSections.ts` — add `'testing-lab'` to `NavSectionKey`/`NAV_SECTIONS`
- `components/Sidebar.tsx` — new `testCasesEnabled` prop, filter, icon
- `app/(app)/[engagementId]/layout.tsx` — pass `testCasesEnabled` to `Sidebar`
- `app/actions/testPackages.ts` — add `getTestPackageDetail`
- `lib/testPackageKpi.ts` (new) + `lib/testPackageKpi.test.ts` (new)
- `app/(app)/[engagementId]/testing-lab/page.tsx` (new)
- `components/testinglab/PackageTabs.tsx` (new)
- `components/testinglab/ResultBadge.tsx` (new)
- `components/testinglab/TestPackageView.tsx` (new) — the client component
  owning result-editing state and the open-ticket modal
- `components/issues/NewIssueForm.tsx` — add optional `initialTestCasePackage` prop
