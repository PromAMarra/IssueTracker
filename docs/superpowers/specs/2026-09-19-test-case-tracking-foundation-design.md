# Test case tracking — Foundation (Sub-project A)

## Goal

Let Prometeia upload structured test cases from Excel files, per engagement,
as the data foundation for two follow-on sub-projects: the end-user "Testing
Lab" tab (Sub-project B) and a restructured dashboard with test-execution
KPIs and trend charts (Sub-project C). This sub-project delivers the data
model, the upload/parse/delete mechanics, the permission split between
Prometeia (manages packages) and Bank/SIT (records results), and the one
change to existing behavior: how a ticket's "Test case package" field is
populated once an engagement adopts this.

This is the first of three sub-projects, sequenced A → B → C because B reads
the data model A creates, and C aggregates across what B displays.

## Background

Every engagement already has an admin-typed, free-text `test_case_packages`
list (`engagements.test_case_packages text[]`, configured in
`components/settings/EngagementConfigForm.tsx`), used purely as the option
list for `NewIssueForm`'s "Test case package" dropdown — a ticket's
`test_case_package` field is just a string, no relationship to anything
else. Not every client actually follows formal, written test cases; this
feature is for the ones who do, without breaking the ones who don't.

The reference file provided (`20250901 - CR 560 Created by attribute.xlsx`)
is the real shape this needs to parse: one sheet, one file = one test
package, five columns — `Step name` (e.g. "001-CR 560 Created by attribute -
Welcome page"), `Step` (sequence number), `Step description`, `Expected
outcome`, and `Result` (empty in the source file — this is what gets filled
in during execution).

The most recent precedent for a per-engagement opt-in flag is
`engagements.sit_expected` (`supabase/migrations/0016_sit_expected.sql`,
shipped today) — this design follows the same shape: default off, nothing
changes for engagements that don't turn it on, a Settings checkbox controls
it.

## Decisions

1. **New engagement flag**: `engagements.test_cases_enabled boolean not null
   default false`. Off = today's exact behavior (manual `test_case_packages`
   list drives the ticket form). On = uploaded packages drive it instead
   (see Decision 5). A Settings checkbox, "Track test cases from uploaded
   files," controls it — Prometeia-only, same as every other engagement
   setting.

2. **New tables**: `test_packages` (one row per uploaded file) and
   `test_package_steps` (one row per sheet row). See Data model below. Each
   upload always creates a brand-new package — there is no
   replace-in-place/versioning in this pass. If Prometeia uploads the wrong
   file, deleting the package outright is included (cheap, and avoids
   leaving them stuck with no recovery).

3. **Excel parsing matches columns by header name**, case-insensitively, not
   by fixed position — a reordered or slightly reformatted sheet still
   parses correctly. The four required headers are `Step name`, `Step`,
   `Step description`, `Expected outcome`; `Result` is optional in the
   source file. Missing a required header fails the upload with an error
   naming exactly which header(s) are missing, before anything is written.
   If a row's `Result` cell already contains a recognizable value (any of
   "Passed", "Passed with minor", "Failed", "N/A", case-insensitive), that
   becomes the step's starting result instead of "not yet tested." The
   `Step` column's value is used as `step_number` when it parses as an
   integer; if it doesn't (blank, text, etc.), the row's position in the
   sheet (1-based, header excluded) is used instead, so a malformed `Step`
   cell never blocks an otherwise-valid upload.

4. **Permission split, enforced at both the Server Action and RLS layer**
   (matching how every other permission in this app works — never
   UI-only):
   - **Prometeia only**: upload a package, delete a package.
   - **Bank/SIT only**: set/change a step's `result`. This is the *inverse*
     of the usual `is_prometeia_user()` gate used everywhere else in this
     app, so it needs its own guard (`requireNonProm()`, new).
   - Nobody edits a step's content (`step_name`/`step_description`/
     `expected_outcome`/`step_number`) after upload — the only mutable
     field post-upload is `result`.
   - Anyone who's a member of the engagement can read packages and steps
     (same `is_engagement_member()` policy pattern used everywhere else).

5. **Ticket-form integration**: `NewIssueForm`'s "Test case package"
   dropdown is populated by `engagement.test_case_packages` when
   `test_cases_enabled` is false (exactly as today), or by every uploaded
   package's `step_name` values, grouped by package name
   (`<optgroup label={package.name}>`), when it's true. The field itself
   doesn't change shape — still a single free-choice dropdown on the
   ticket — only where its options come from changes.

## Non-goals (deferred to Sub-project B or C)

- The end-user "Testing Lab" tab: package sub-tabs, the per-step results
  table mirroring the sheet, the KPI header (total/% tested/% failed/% to be
  tested). **Sub-project B.**
- The "+ Open new ticket" button appearing next to a Failed/Passed-with-minor
  step, pre-filling the ticket's test case package to that step. **Sub-project
  B.**
- Dashboard restructuring, cross-package KPIs, trend/trajectory charts.
  **Sub-project C.**
- Package versioning or replace-in-place — re-uploading always creates a
  new, independent package.
- Editing step content after upload.
- A per-change audit *history* table for results (matching `issue_history`'s
  full log) — out of scope for this pass. A lightweight two-column "last
  changed by/when" on the step row itself is included (Data model below)
  since it's nearly free and directly useful for a shared, collaborative
  results table; a full change-by-change log is not.

## Data model

```sql
-- 0018_test_case_tracking.sql

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

`result`/`result_updated_by`/`result_updated_at` are the only columns the
`update` policy needs to allow changing in practice; like every other
mutation in this app, that's enforced by the Server Action only ever sending
those three columns in its `UPDATE`, not by a column-level grant — the same
trust boundary already relied on for `updateIssuePriority` etc. (RLS gates
the *row*, the Server Action is the only sanctioned path to it).

## Server Actions (`app/actions/testPackages.ts`, new file)

- `uploadTestPackage(engagementId: string, name: string, formData: FormData): Promise<{ packageId: string; stepCount: number }>`
  — Prometeia-only (`requireProm()`). Rejects if `test_cases_enabled` is
  false for the engagement (turn the flag on first, same order Settings
  already enforces for SIT). Parses the uploaded `.xlsx` with the `xlsx`
  package (already a dependency, used today for the Excel *export* feature —
  reused here for reading, not a new dependency), matching headers
  case-insensitively. Inserts the package row, then every step row, in one
  transaction-equivalent sequence (package insert, then steps insert — if
  the steps insert fails, the caller deletes the orphaned package row before
  re-throwing, since Supabase's JS client has no multi-statement
  transaction primitive).
- `deleteTestPackage(packageId: string): Promise<void>` — Prometeia-only;
  `on delete cascade` handles the steps.
- `listTestPackages(engagementId: string): Promise<{ id: string; name: string; stepCount: number; createdAt: string }[]>`
  — any engagement member; used by Settings' package list (this pass) and
  the Testing Lab tab (Sub-project B).
- `updateTestStepResult(stepId: string, result: TestResult | null): Promise<void>`
  — Bank/SIT-only (`requireNonProm()`, new helper, the inverse of
  `requireProm()`). Sets `result`, `result_updated_by = session.id`,
  `result_updated_at = now()`.
- `listTestCaseStepOptions(engagementId: string): Promise<{ packageName: string; stepName: string }[]>`
  — any engagement member; feeds `NewIssueForm`'s dropdown when
  `test_cases_enabled` is true.

`TestResult` type (`lib/types.ts`): `'passed' | 'passed_with_minor' | 'failed' | 'na'`,
with a display-label map (`Passed`, `Passed with minor`, `Failed`, `N/A`)
alongside the existing `Status`/`Priority` label maps' style.

## Minimal admin UI (this pass only — Sub-project B replaces/relocates this)

A "Test packages" section in `EngagementConfigForm`'s Settings page,
rendered only when `test_cases_enabled` is true: an upload form (package
name, pre-filled from the file name with the `.xlsx` extension stripped;
file picker, `.xlsx` only) and a plain
list of existing packages (name, step count, uploaded date, a delete
button). No per-step table, no results, no KPIs here — that's the Testing
Lab tab's job in Sub-project B, which may keep this list in Settings, move
it into the Testing Lab tab, or both; that's Sub-project B's own decision,
not fixed here.

## Testing plan

- `lib/testCaseImport.ts` (new): the pure parsing/validation logic —
  given a raw sheet-like structure (array of row objects, or the `xlsx`
  library's parsed JSON), extract & validate the four required columns,
  produce step rows, detect and normalize any pre-filled `Result` values,
  and produce the specific missing-header error. Unit-testable without a
  real file or a Supabase client, following this repo's existing convention
  (pure logic under `lib/` gets tests; Server Actions and RLS do not,
  because nothing in this repo mocks Supabase). Tests cover: exact headers,
  reordered headers, a missing required header (each of the four,
  individually), extra unrelated columns ignored, a pre-filled recognizable
  `Result` value normalized correctly, an unrecognized `Result` value
  treated as untested, and a non-numeric `Step` value falling back to row
  order.
- `tsc --noEmit`, `npm test`, `npm run build` clean, same as every change
  this session.
- No live upload can be exercised in this sandbox (no Supabase project,
  same standing limitation as everything else) — verified by static
  review + the unit tests above, disclosed the same way prior work this
  session has been.

## Files touched

- `supabase/migrations/0018_test_case_tracking.sql` (new)
- `lib/types.ts` (add `TestResult` + label map)
- `lib/testCaseImport.ts` (new) + `lib/testCaseImport.test.ts` (new)
- `app/actions/testPackages.ts` (new)
- `app/actions/testPackages.ts` (also defines `requireNonProm()`, colocated in this new file — `requireProm()` itself is already duplicated independently in `app/actions/issues.ts` and `app/actions/engagements.ts` rather than centralized, so a third, similarly-scoped local copy matches existing precedent rather than starting an unrelated centralization refactor)
- `lib/data/engagements.ts` (add `test_cases_enabled` to the `Engagement` type + `getEngagement`'s select list)
- `app/actions/engagements.ts` (add `testCasesEnabled` to `EngagementInput`, wire into create/update)
- `components/settings/EngagementConfigForm.tsx` (the new checkbox + the package upload/list section)
- `components/issues/NewIssueForm.tsx` (dropdown source switch)
- `app/(app)/[engagementId]/settings/page.tsx` (fetch packages, pass down)
- `app/(app)/[engagementId]/board/page.tsx` and `list/page.tsx` (pass whatever `NewIssueForm`/`NewIssueModal` now needs — likely just `testCasesEnabled` + the step options, fetched alongside the engagement)
- `package.json` — no new dependency; `xlsx` is already present for export

## Alternatives considered

- **JSON blob per package** instead of a `test_package_steps` table —
  rejected: Sub-projects B and C need to filter, aggregate, and sum results
  per package and across packages (KPIs, trend charts), which a normalized
  table supports directly and a blob does not; also inconsistent with how
  every other piece of data in this app is stored.
- **Re-parse the original file on every page load** instead of storing
  parsed rows — rejected: fragile (couples every read to Storage
  availability and parse-time cost), and blocks efficient querying/KPI
  aggregation the same way the blob option does.
