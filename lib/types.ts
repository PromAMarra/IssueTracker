/**
 * Central domain type definitions for the issue-tracking and test-package
 * domains, shared by every pure function in lib/, every Server Action in
 * app/actions/, and most UI components. This file has zero dependencies and
 * zero logic (aside from a couple of tiny label lookup tables) — it exists
 * purely so the rest of the codebase shares one definition of these shapes
 * rather than each module redeclaring its own.
 *
 * CRITICAL invariant: these types must be kept in sync BY HAND with the
 * actual Postgres schema (see supabase/migrations/*.sql) — there is no
 * generated-types pipeline in this project tying them together. If a
 * migration adds/renames/removes a column or a check-constraint enum value
 * (e.g. `issues.status`, `test_package_steps` result columns), this file
 * must be updated to match, or TypeScript will happily compile code that
 * reads/writes a shape the database no longer has (or doesn't yet have).
 *
 * `Status` is the issue lifecycle state machine driven mutually by Prometeia
 * (backlog -> ongoing -> ready_for_test) and Bank/SIT (see
 * lib/issueAccess.ts's BANK_SIT_ALLOWED_TRANSITIONS for the only transitions
 * a Bank/SIT user may trigger directly). `TestResult` is the per-step
 * verdict a tester records; since migration 0022 it is recorded
 * independently per phase (`test_package_steps.sit_result` /
 * `.uat_result`), so a single `TestResult` value here always represents ONE
 * phase's opinion, never a merged/shared result.
 */
export type Status = 'backlog' | 'ongoing' | 'ready_for_test' | 'closed' | 'rejected';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Org = 'prometeia' | 'bank' | 'sit';

export type Issue = {
  id: string;
  engagement_id: string;
  key: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  module: string | null;
  test_case_package: string | null;
  test_case_step: string | null;
  org: Org;
  reporter_id: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type IssueHistoryEntry = {
  id: string;
  issue_id: string;
  field: string;
  from_value: string | null;
  to_value: string;
  changed_by: string;
  changed_at: string;
};

export type SlaDays = Record<Priority, number>;

export const STATUSES: Status[] = ['backlog', 'ongoing', 'ready_for_test', 'closed', 'rejected'];
export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export type TestResult = 'passed' | 'passed_with_minor' | 'failed' | 'na';
export const TEST_RESULTS: TestResult[] = ['passed', 'passed_with_minor', 'failed', 'na'];
export const TEST_RESULT_LABELS: Record<TestResult, string> = {
  passed: 'Passed',
  passed_with_minor: 'Passed with minor',
  failed: 'Failed',
  na: 'N/A',
};
