# Test Case Tracking Foundation (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Prometeia upload structured test cases from `.xlsx` files per engagement, store them relationally, let Bank/SIT record per-step results, and switch a ticket's "Test case package" dropdown to those uploaded step names once an engagement opts in — the data foundation for the Testing Lab tab (Sub-project B) and dashboard restructuring (Sub-project C).

**Architecture:** Two new tables (`test_packages`, `test_package_steps`) behind a new `engagements.test_cases_enabled` flag, RLS-enforced with an inverted permission split (Prometeia manages packages, Bank/SIT sets results — the opposite of every other write policy in this app, so it needs its own `requireNonProm()` guard). Parsing is a pure function (`lib/testCaseImport.ts`) fed by the `xlsx` package (already a dependency) inside a new Server Actions file, matching this repo's existing "Server Actions are the only mutation path" convention.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS), `xlsx` (SheetJS, already installed), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-test-case-tracking-foundation-design.md`

## Global Constraints

- No new npm dependency — reuse the existing `xlsx` package (already used client-side for Excel export in `lib/exportXlsx.ts`; this plan uses it server-side for reading).
- Every mutation goes through a Server Action — no direct client-side Supabase calls, matching every existing action file.
- Every permission is enforced at both the Server Action layer and RLS — never UI-only.
- Only pure logic under `lib/` gets a Vitest unit test in this repo's existing convention; Server Actions, RLS policies, and components are verified via `tsc --noEmit` / `npm run build` only (no test mocks Supabase anywhere in this codebase).
- Match existing code style exactly: Tailwind utility classes already in use (`bg-ink`, `text-ink-soft`, `bg-brand-blue`, `border-hairline`, etc.), Tabler Icons with `stroke={1.5}`, the `requireProm()` "duplicate the tiny helper per file" pattern already used in `app/actions/issues.ts` and `app/actions/engagements.ts`.

---

### Task 1: Data model — migration, types, and the engagement flag

**Files:**
- Create: `supabase/migrations/0018_test_case_tracking.sql`
- Modify: `lib/types.ts`
- Modify: `lib/data/engagements.ts`
- Modify: `app/actions/engagements.ts`
- Modify: `components/settings/NewEngagementForm.tsx`
- Modify: `components/settings/EngagementConfigForm.tsx`
- Modify: `app/(app)/[engagementId]/settings/page.tsx`

**Interfaces:**
- Produces: `TestResult` type + `TEST_RESULTS`/`TEST_RESULT_LABELS` constants in `lib/types.ts`; `Engagement.test_cases_enabled: boolean`; `EngagementInput.testCasesEnabled: boolean`; DB tables `test_packages`/`test_package_steps` with the columns listed below.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0018_test_case_tracking.sql`:

```sql
alter table public.engagements
  add column test_cases_enabled boolean not null default false;

create table public.test_packages (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  name text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.test_package_steps (
  id uuid primary key default gen_random_uuid(),
  test_package_id uuid not null references public.test_packages(id) on delete cascade,
  step_number integer not null,
  step_name text not null,
  step_description text not null,
  expected_outcome text not null,
  result text check (result in ('passed', 'passed_with_minor', 'failed', 'na')),
  result_updated_by uuid references public.profiles(id),
  result_updated_at timestamptz
);

create index test_packages_engagement_id_idx
  on public.test_packages (engagement_id, created_at desc);
create index test_package_steps_package_id_idx
  on public.test_package_steps (test_package_id, step_number);

alter table public.test_packages enable row level security;
alter table public.test_package_steps enable row level security;

create policy "test_packages_select" on public.test_packages for select
  using (is_engagement_member(engagement_id));
create policy "test_packages_insert_prometeia" on public.test_packages for insert
  with check (is_prometeia_user());
create policy "test_packages_delete_prometeia" on public.test_packages for delete
  using (is_prometeia_user());

create policy "test_package_steps_select" on public.test_package_steps for select
  using (exists (
    select 1 from public.test_packages tp
    where tp.id = test_package_id and is_engagement_member(tp.engagement_id)
  ));
create policy "test_package_steps_insert_prometeia" on public.test_package_steps for insert
  with check (exists (
    select 1 from public.test_packages tp where tp.id = test_package_id and is_prometeia_user()
  ));
-- Inverse of every other write policy in this app: Bank/SIT only, Prometeia excluded.
create policy "test_package_steps_update_bank_sit" on public.test_package_steps for update
  using (exists (
    select 1 from public.test_packages tp
    where tp.id = test_package_id
      and is_engagement_member(tp.engagement_id)
      and not is_prometeia_user()
  ))
  with check (exists (
    select 1 from public.test_packages tp
    where tp.id = test_package_id
      and is_engagement_member(tp.engagement_id)
      and not is_prometeia_user()
  ));
```

There is no test for a migration file in this repo's convention — SQL is
verified by being syntactically valid and matching the RLS helper functions
(`is_engagement_member`, `is_prometeia_user`) already defined in
`supabase/migrations/0002_rls.sql`.

- [ ] **Step 2: Add the `TestResult` type to `lib/types.ts`**

Append after the existing `PRIORITIES` constant (currently the last line):

```ts
export type TestResult = 'passed' | 'passed_with_minor' | 'failed' | 'na';
export const TEST_RESULTS: TestResult[] = ['passed', 'passed_with_minor', 'failed', 'na'];
export const TEST_RESULT_LABELS: Record<TestResult, string> = {
  passed: 'Passed',
  passed_with_minor: 'Passed with minor',
  failed: 'Failed',
  na: 'N/A',
};
```

- [ ] **Step 3: Add `test_cases_enabled` to the `Engagement` type and `getEngagement`**

In `lib/data/engagements.ts`, the `Engagement` type currently ends with `sit_expected: boolean;`
(added in an earlier, already-shipped change) — add the new field right after it:

```ts
  test_cases_enabled: boolean;
```

`getEngagement`'s select currently ends with `..., uat_end_date, sit_expected'` — append the new
column so the full select string reads:

```ts
      'id, name, bank_name, bank_logo_url, key_prefix, modules, test_case_packages, sla_days, sit_start_date, sit_end_date, uat_start_date, uat_end_date, sit_expected, test_cases_enabled',
```

- [ ] **Step 4: Wire `testCasesEnabled` through `app/actions/engagements.ts`**

`EngagementInput` currently ends with `sitExpected: boolean;` — add the new field right after it:

```ts
  testCasesEnabled: boolean;
```

Both `createEngagement`'s `.insert({...})` and `updateEngagementSettings`'s `.update({...})` currently
end their field list with `sit_expected: input.sitExpected,` (right before `created_by: session.id,` in
`createEngagement`, and right before the closing `})` in `updateEngagementSettings`) — add
`test_cases_enabled: input.testCasesEnabled,` right after that line in both places.

- [ ] **Step 5: Add the default to `NewEngagementForm.tsx`**

In `components/settings/NewEngagementForm.tsx`, add to the `EMPTY` object:

```ts
  testCasesEnabled: false,
```

- [ ] **Step 6: Add the checkbox to `EngagementConfigForm.tsx`**

Add `testCasesEnabled: boolean;` to the `EngagementConfigValues` type, and a `useState` for it:

```ts
  const [testCasesEnabled, setTestCasesEnabled] = useState(initial.testCasesEnabled);
```

Add `testCasesEnabled` to the object passed to `onSubmit(...)`.

Add the checkbox itself, right after the existing "This engagement has a SIT phase" checkbox (same visual pattern — a `flex items-start gap-2` label with a helper line):

```tsx
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={testCasesEnabled}
          onChange={(e) => setTestCasesEnabled(e.target.checked)}
          className="mt-1"
        />
        <span className="flex flex-col gap-1">
          Track test cases from uploaded files
          <span className="text-xs text-ink-soft">
            When on, Prometeia can upload test case files and the "Test case package" field on
            tickets is populated from them instead of the list below.
          </span>
        </span>
      </label>
```

Then wrap the existing "Test case packages (comma-separated)" `<label>` block in
`{!testCasesEnabled && (...)}` so it's hidden once uploads are the source of truth (don't
delete the field or its state — just don't render it).

- [ ] **Step 7: Pass `testCasesEnabled` through the Settings page**

In `app/(app)/[engagementId]/settings/page.tsx`, add `testCasesEnabled: engagement.test_cases_enabled` to
the `initial={{...}}` object passed to `<SettingsForm>`.

- [ ] **Step 8: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add supabase/migrations/0018_test_case_tracking.sql lib/types.ts lib/data/engagements.ts app/actions/engagements.ts components/settings/NewEngagementForm.tsx components/settings/EngagementConfigForm.tsx "app/(app)/[engagementId]/settings/page.tsx"
git commit -m "feat: add test_cases_enabled flag and test-package data model"
```

---

### Task 2: Pure Excel-row parsing logic

**Files:**
- Create: `lib/testCaseImport.ts`
- Test: `lib/testCaseImport.test.ts`

**Interfaces:**
- Consumes: `TestResult` from `lib/types.ts` (Task 1).
- Produces: `ParsedTestStep` type, `ParseTestCaseSheetResult` type, `parseTestCaseSheet(rows: Record<string, unknown>[]): ParseTestCaseSheetResult` — used by Task 3's `uploadTestPackage`.

- [ ] **Step 1: Write the failing tests**

Create `lib/testCaseImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTestCaseSheet } from './testCaseImport';

const VALID_ROWS = [
  {
    'Step name': '001-CR 560 Created by attribute - Welcome page',
    Step: 1,
    'Step description': 'Do the thing.',
    'Expected outcome': 'The thing happens.',
    Result: null,
  },
  {
    'Step name': '002-CR 560 Created by attribute - Office view',
    Step: 2,
    'Step description': 'Do the other thing.',
    'Expected outcome': 'The other thing happens.',
    Result: null,
  },
];

describe('parseTestCaseSheet', () => {
  it('parses rows with exact headers', () => {
    const result = parseTestCaseSheet(VALID_ROWS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({
      stepNumber: 1,
      stepName: '001-CR 560 Created by attribute - Welcome page',
      stepDescription: 'Do the thing.',
      expectedOutcome: 'The thing happens.',
      result: null,
    });
  });

  it('matches headers by name regardless of column order', () => {
    const reordered = VALID_ROWS.map((row) => ({
      'Expected outcome': row['Expected outcome'],
      Step: row.Step,
      'Step description': row['Step description'],
      'Step name': row['Step name'],
    }));
    const result = parseTestCaseSheet(reordered);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].stepName).toBe('001-CR 560 Created by attribute - Welcome page');
  });

  it('matches headers case-insensitively', () => {
    const upper = VALID_ROWS.map((row) => ({
      'STEP NAME': row['Step name'],
      STEP: row.Step,
      'step description': row['Step description'],
      'Expected Outcome': row['Expected outcome'],
    }));
    const result = parseTestCaseSheet(upper);
    expect(result.ok).toBe(true);
  });

  it('reports a single missing required header by name', () => {
    const rows = VALID_ROWS.map(({ Step, ...rest }) => rest);
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('Step');
  });

  it('reports every missing required header when several are absent', () => {
    const rows = VALID_ROWS.map(({ Step, 'Expected outcome': _eo, ...rest }) => rest);
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('Step');
    expect(result.error).toContain('Expected outcome');
  });

  it('ignores extra unrelated columns', () => {
    const withExtra = VALID_ROWS.map((row) => ({ ...row, 'Some other column': 'noise' }));
    const result = parseTestCaseSheet(withExtra);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(Object.keys(result.steps[0])).not.toContain('Some other column');
  });

  it('normalizes a recognizable pre-filled Result value', () => {
    const rows = [{ ...VALID_ROWS[0], Result: 'Passed with minor' }];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].result).toBe('passed_with_minor');
  });

  it('treats an unrecognized Result value as untested', () => {
    const rows = [{ ...VALID_ROWS[0], Result: 'Not sure yet' }];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].result).toBeNull();
  });

  it('falls back to row order when Step is non-numeric', () => {
    const rows = [
      { ...VALID_ROWS[0], Step: 'n/a' },
      { ...VALID_ROWS[1], Step: 'n/a' },
    ];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].stepNumber).toBe(1);
    expect(result.steps[1].stepNumber).toBe(2);
  });

  it('filters out a fully blank trailing row', () => {
    const rows = [...VALID_ROWS, { 'Step name': '', Step: '', 'Step description': '', 'Expected outcome': '' }];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps).toHaveLength(2);
  });

  it('fails on zero data rows', () => {
    const result = parseTestCaseSheet([]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('no data rows');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/testCaseImport.test.ts`
Expected: FAIL — `Cannot find module './testCaseImport'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/testCaseImport.ts`:

```ts
import type { TestResult } from './types';

export type ParsedTestStep = {
  stepNumber: number;
  stepName: string;
  stepDescription: string;
  expectedOutcome: string;
  result: TestResult | null;
};

export type ParseTestCaseSheetResult = { ok: true; steps: ParsedTestStep[] } | { ok: false; error: string };

const REQUIRED_HEADERS = ['Step name', 'Step', 'Step description', 'Expected outcome'] as const;
type RequiredHeader = (typeof REQUIRED_HEADERS)[number];
const RESULT_HEADER = 'Result';

const RESULT_ALIASES: Record<string, TestResult> = {
  passed: 'passed',
  'passed with minor': 'passed_with_minor',
  failed: 'failed',
  na: 'na',
  'n/a': 'na',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function findHeaderKey(rowKeys: string[], header: string): string | undefined {
  const target = normalizeHeader(header);
  return rowKeys.find((key) => normalizeHeader(key) === target);
}

function normalizeResult(raw: unknown): TestResult | null {
  if (typeof raw !== 'string') return null;
  return RESULT_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function parseTestCaseSheet(rows: Record<string, unknown>[]): ParseTestCaseSheetResult {
  if (rows.length === 0) {
    return { ok: false, error: 'The sheet has no data rows.' };
  }

  const sampleKeys = Object.keys(rows[0]);
  const headerKeys: Partial<Record<RequiredHeader, string>> = {};
  const missing: string[] = [];
  for (const header of REQUIRED_HEADERS) {
    const key = findHeaderKey(sampleKeys, header);
    if (!key) missing.push(header);
    else headerKeys[header] = key;
  }
  if (missing.length > 0) {
    return { ok: false, error: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.` };
  }
  // Every required header is guaranteed present past the check above.
  const cols = headerKeys as Record<RequiredHeader, string>;
  const resultKey = findHeaderKey(sampleKeys, RESULT_HEADER);

  const steps: ParsedTestStep[] = rows
    .map((row, index) => {
      const rawStepNumber = row[cols['Step']];
      const parsedStepNumber = typeof rawStepNumber === 'number' ? rawStepNumber : Number(rawStepNumber);
      const stepNumber = Number.isInteger(parsedStepNumber) ? parsedStepNumber : index + 1;

      return {
        stepNumber,
        stepName: String(row[cols['Step name']] ?? '').trim(),
        stepDescription: String(row[cols['Step description']] ?? '').trim(),
        expectedOutcome: String(row[cols['Expected outcome']] ?? '').trim(),
        result: resultKey ? normalizeResult(row[resultKey]) : null,
      };
    })
    // A fully blank trailing row (common at the end of an Excel sheet) has no step name.
    .filter((step) => step.stepName !== '');

  return { ok: true, steps };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/testCaseImport.test.ts`
Expected: PASS, all 11 tests.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add lib/testCaseImport.ts lib/testCaseImport.test.ts
git commit -m "feat: add pure Excel-row parsing for test case uploads"
```

---

### Task 3: Test package Server Actions

**Files:**
- Create: `app/actions/testPackages.ts`

**Interfaces:**
- Consumes: `getSessionUser` from `lib/auth/session.ts`; `createServerClient` from `lib/supabase/server.ts`; `parseTestCaseSheet` from `lib/testCaseImport.ts` (Task 2); `TestResult` from `lib/types.ts` (Task 1); the `test_packages`/`test_package_steps` tables (Task 1).
- Produces: `TestPackageSummary` type, `TestCaseStepOption` type, `uploadTestPackage(engagementId, name, formData): Promise<{ packageId: string; stepCount: number }>`, `deleteTestPackage(engagementId, packageId): Promise<void>`, `listTestPackages(engagementId): Promise<TestPackageSummary[]>`, `updateTestStepResult(stepId, result): Promise<void>`, `listTestCaseStepOptions(engagementId): Promise<TestCaseStepOption[]>` — all consumed by Task 4 (Settings UI) and Task 5 (ticket form).

- [ ] **Step 1: Write the file**

Create `app/actions/testPackages.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { parseTestCaseSheet } from '@/lib/testCaseImport';
import type { TestResult } from '@/lib/types';

async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

// Inverse of requireProm() — this app's only Bank/SIT-exclusive write path.
async function requireNonProm() {
  const session = await getSessionUser();
  if (!session || session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

export type TestPackageSummary = {
  id: string;
  name: string;
  stepCount: number;
  createdAt: string;
};

export async function uploadTestPackage(
  engagementId: string,
  name: string,
  formData: FormData,
): Promise<{ packageId: string; stepCount: number }> {
  const session = await requireProm();
  const supabase = createServerClient();

  const { data: engagement, error: engagementError } = await supabase
    .from('engagements')
    .select('test_cases_enabled')
    .eq('id', engagementId)
    .single();
  if (engagementError) throw engagementError;
  if (!engagement.test_cases_enabled) {
    throw new Error('Turn on "Track test cases from uploaded files" in Settings before uploading a package.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Package name is required.');

  const XLSX = await import('xlsx');
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('The uploaded file has no sheets.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName]);

  const parsed = parseTestCaseSheet(rows);
  if (!parsed.ok) throw new Error(parsed.error);

  const { data: pkg, error: pkgError } = await supabase
    .from('test_packages')
    .insert({ engagement_id: engagementId, name: trimmedName, uploaded_by: session.id })
    .select('id')
    .single();
  if (pkgError) throw pkgError;

  const { error: stepsError } = await supabase.from('test_package_steps').insert(
    parsed.steps.map((step) => ({
      test_package_id: pkg.id,
      step_number: step.stepNumber,
      step_name: step.stepName,
      step_description: step.stepDescription,
      expected_outcome: step.expectedOutcome,
      result: step.result,
    })),
  );
  if (stepsError) {
    // Best-effort cleanup, not a real rollback — the Supabase JS client has
    // no multi-statement transaction primitive.
    await supabase.from('test_packages').delete().eq('id', pkg.id);
    throw stepsError;
  }

  revalidatePath(`/${engagementId}/settings`);
  return { packageId: pkg.id as string, stepCount: parsed.steps.length };
}

export async function deleteTestPackage(engagementId: string, packageId: string): Promise<void> {
  await requireProm();
  const supabase = createServerClient();
  const { error } = await supabase.from('test_packages').delete().eq('id', packageId);
  if (error) throw error;
  revalidatePath(`/${engagementId}/settings`);
}

export async function listTestPackages(engagementId: string): Promise<TestPackageSummary[]> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select('id, name, created_at, test_package_steps(count)')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as { id: string; name: string; created_at: string; test_package_steps: { count: number }[] }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    stepCount: row.test_package_steps[0]?.count ?? 0,
    createdAt: row.created_at,
  }));
}

export async function updateTestStepResult(stepId: string, result: TestResult | null): Promise<void> {
  const session = await requireNonProm();
  const supabase = createServerClient();
  const { error } = await supabase
    .from('test_package_steps')
    .update({ result, result_updated_by: session.id, result_updated_at: new Date().toISOString() })
    .eq('id', stepId);
  if (error) throw error;
}

export type TestCaseStepOption = { packageName: string; stepName: string };

export async function listTestCaseStepOptions(engagementId: string): Promise<TestCaseStepOption[]> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select('name, test_package_steps(step_name, step_number)')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (
    data as unknown as { name: string; test_package_steps: { step_name: string; step_number: number }[] }[]
  ).flatMap((pkg) =>
    [...pkg.test_package_steps]
      .sort((a, b) => a.step_number - b.step_number)
      .map((step) => ({ packageName: pkg.name, stepName: step.step_name })),
  );
}
```

No test file for this task — this repo has no precedent for mocking Supabase in a test (confirmed
in the spec's Background section), matching every other `app/actions/*.ts` file.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add app/actions/testPackages.ts
git commit -m "feat: add test package upload/delete/list and result-update actions"
```

---

### Task 4: Settings UI — upload form and package list

**Files:**
- Create: `components/settings/TestPackageManager.tsx`
- Modify: `app/(app)/[engagementId]/settings/page.tsx`

**Interfaces:**
- Consumes: `uploadTestPackage`, `deleteTestPackage`, `listTestPackages`, `TestPackageSummary` from `app/actions/testPackages.ts` (Task 3).
- Produces: `<TestPackageManager engagementId={string} initialPackages={TestPackageSummary[]} />`, rendered by the Settings page.

- [ ] **Step 1: Write `TestPackageManager.tsx`**

Create `components/settings/TestPackageManager.tsx`:

```tsx
'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { deleteTestPackage, uploadTestPackage, type TestPackageSummary } from '@/app/actions/testPackages';

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export function TestPackageManager({
  engagementId,
  initialPackages,
}: {
  engagementId: string;
  initialPackages: TestPackageSummary[];
}) {
  const [packages, setPackages] = useState(initialPackages);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !name) setName(stripExtension(selected.name));
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const trimmedName = name.trim();
      const { packageId, stepCount } = await uploadTestPackage(engagementId, trimmedName, formData);
      setPackages((prev) => [
        { id: packageId, name: trimmedName, stepCount, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload this file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(packageId: string) {
    if (!window.confirm('Delete this test package? This cannot be undone.')) return;
    try {
      await deleteTestPackage(engagementId, packageId);
      setPackages((prev) => prev.filter((p) => p.id !== packageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this package.');
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-2 text-sm font-bold text-ink">Test packages</h2>
      <ul className="mb-3 flex flex-col gap-1">
        {packages.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm text-ink-soft">
            <span>
              {p.name} <span className="text-xs">({p.stepCount} step{p.stepCount === 1 ? '' : 's'})</span>
            </span>
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              aria-label={`Delete ${p.name}`}
              title={`Delete ${p.name}`}
              className="text-ink-soft hover:text-red-600"
            >
              <IconTrash className="h-3.5 w-3.5" stroke={1.5} />
            </button>
          </li>
        ))}
        {packages.length === 0 && <li className="text-sm text-ink-soft">No test packages uploaded yet.</li>}
      </ul>
      <form onSubmit={handleUpload} className="flex flex-col gap-2">
        <input
          type="text"
          required
          placeholder="Package name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-ink-soft/30 px-3 py-2 text-sm"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          required
          onChange={handleFileChange}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={uploading || !file}
          className="w-fit rounded-md bg-brand-blue px-3 py-2 text-sm font-bold text-white hover:bg-primary-active disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Settings page**

In `app/(app)/[engagementId]/settings/page.tsx`, import `listTestPackages` from `@/app/actions/testPackages`
and `TestPackageManager` from `@/components/settings/TestPackageManager`. Fetch packages alongside the
existing `Promise.all` calls, conditionally on the flag:

```ts
const testPackages = engagement.test_cases_enabled ? await listTestPackages(params.engagementId) : [];
```

(This must happen after `getEngagement` resolves, same as the existing `sitMembers` conditional fetch — add
it as its own `const` right after the `if (!engagement) redirect('/');` line, not inside the earlier
`Promise.all`.)

Render it conditionally, near the other settings sections:

```tsx
      {engagement.test_cases_enabled && (
        <section>
          <TestPackageManager engagementId={params.engagementId} initialPackages={testPackages} />
        </section>
      )}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add components/settings/TestPackageManager.tsx "app/(app)/[engagementId]/settings/page.tsx"
git commit -m "feat: add Settings UI for uploading and deleting test packages"
```

---

### Task 5: Ticket form — dropdown sourced from uploaded step names

**Files:**
- Modify: `components/issues/NewIssueForm.tsx`
- Modify: `components/issues/NewIssueModal.tsx`
- Modify: `app/(app)/[engagementId]/board/page.tsx`

**Interfaces:**
- Consumes: `listTestCaseStepOptions`, `TestCaseStepOption` from `app/actions/testPackages.ts` (Task 3); `engagement.test_cases_enabled` (Task 1).
- Produces: `NewIssueForm`/`NewIssueModal` now take `testCasesEnabled: boolean` and `testCaseStepOptions: TestCaseStepOption[]` props.

- [ ] **Step 1: Update `NewIssueForm.tsx`**

Add the import:

```ts
import type { TestCaseStepOption } from '@/app/actions/testPackages';
```

Add a local grouping helper near the top of the file, after the `PRIORITIES` constant:

```ts
function groupStepOptionsByPackage(options: TestCaseStepOption[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const { packageName, stepName } of options) {
    (grouped[packageName] ??= []).push(stepName);
  }
  return grouped;
}
```

Add `testCasesEnabled: boolean;` and `testCaseStepOptions: TestCaseStepOption[];` to the component's
props type (both the destructure and the type block), alongside the existing `testCasePackages: string[];`.

Replace the "Test case package" `<select>`'s children:

```tsx
    <option value="">No test case package</option>
    {testCasePackages.map((p) => (
      <option key={p} value={p}>
        {p}
      </option>
    ))}
```

with:

```tsx
    <option value="">No test case package</option>
    {testCasesEnabled
      ? Object.entries(groupStepOptionsByPackage(testCaseStepOptions)).map(([packageName, stepNames]) => (
          <optgroup key={packageName} label={packageName}>
            {stepNames.map((stepName) => (
              <option key={stepName} value={stepName}>
                {stepName}
              </option>
            ))}
          </optgroup>
        ))
      : testCasePackages.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
```

- [ ] **Step 2: Update `NewIssueModal.tsx`**

Add `testCasesEnabled: boolean;` and `testCaseStepOptions: TestCaseStepOption[];` to its props type
(import `TestCaseStepOption` the same way), and pass both straight through to `<NewIssueForm>`.

- [ ] **Step 3: Update `board/page.tsx`**

Import `listTestCaseStepOptions` from `@/app/actions/testPackages`. Add it to the existing `Promise.all`:

```ts
  const [engagement, issues, teamMembers, testCaseStepOptions] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listPrometeiaTeam(params.engagementId),
    listTestCaseStepOptions(params.engagementId),
  ]);
```

Pass the two new props to `<NewIssueModal>`:

```tsx
      <NewIssueModal
        engagementId={engagement.id}
        modules={engagement.modules}
        testCasePackages={engagement.test_case_packages}
        testCasesEnabled={engagement.test_cases_enabled}
        testCaseStepOptions={testCaseStepOptions}
        teamMembers={teamMembers}
      />
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm test
npm run build
git add components/issues/NewIssueForm.tsx components/issues/NewIssueModal.tsx "app/(app)/[engagementId]/board/page.tsx"
git commit -m "feat: source the ticket form's test case package field from uploaded steps"
```

---

## Final Steps

- [ ] Whole-branch review (fresh context) against this plan and the spec before merging.
- [ ] Merge to `main`, sync `master`, push both — following this repo's established convention.
- [ ] Report to the user: what shipped, the two outstanding manual steps (running migration `0018` in the Supabase SQL editor; nothing else is needed since no new env vars or dependencies were introduced), and the same standing caveat as every other feature this session — verified via `tsc`/tests/build only, no live Supabase-backed environment here to click through the upload flow by hand.
