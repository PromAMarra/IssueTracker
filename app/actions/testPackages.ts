'use server';

import { cache } from 'react';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { parseTestCaseSheet } from '@/lib/testCaseImport';
import type { TestResult } from '@/lib/types';

/**
 * Server Actions for UAT/SIT test packages: Prometeia uploads an Excel
 * script (`uploadTestPackage`) that is parsed into `test_package_steps` rows
 * via `lib/testCaseImport.ts`, assigns per-phase execution owners
 * (`setTestPackageExecutionOwner`), and Bank/SIT testers record pass/fail
 * results per step (`updateTestStepResult`). Powers the Testing Lab UI and
 * feeds the Testing Insights dashboard (via `listTestPackagesWithResults`).
 *
 * Since migration 0022, SIT and UAT are tracked as two fully independent
 * results per step (`sit_result` / `uat_result`, each with its own
 * `..._updated_by` / `..._updated_at`) rather than one shared `result`
 * column — SIT and UAT testers can genuinely disagree about the same step,
 * and both opinions must be preserved. Every function below that reads or
 * writes a step's result is phase-aware; there is no more "the" result for a
 * step, only "SIT's" and "UAT's".
 *
 * Security model, same pattern as the rest of app/actions:
 * - `requireProm()` gates package/owner management (upload, delete, set
 *   owner). Real boundary: `test_packages_insert_prometeia` /
 *   `test_packages_delete_prometeia` (supabase/migrations/
 *   0018_test_case_tracking.sql) and `test_packages_update_prometeia`
 *   (re-created in 0022, since 0018 never added an UPDATE policy for this
 *   table).
 * - `requireNonProm()` gates `updateTestStepResult` — this is the ONLY
 *   Bank/SIT-exclusive write path in the entire app (every other mutation
 *   flows the opposite way). Real boundary:
 *   `test_package_steps_update_bank_sit` plus the `test_step_result_only`
 *   trigger (redefined in 0022_phase_scoped_results_and_owners.sql), which
 *   pins every column except the caller's own phase's result columns back to
 *   their old values — "RLS gates rows, not columns" applied per-column,
 *   keyed off the actor's own `engagement_members.phase` looked up
 *   server-side from `auth.uid()`, never trusted from the request payload.
 *   This Server Action re-derives that same phase independently below, but
 *   only to target the right pair of columns — not to enforce security; the
 *   trigger enforces that regardless of what this code sends.
 *
 * Optimistic concurrency: `updateTestStepResult` follows the same
 * compare-and-swap pattern as app/actions/issues.ts's field mutations —
 * conditioning the `.update()` on `previousResult` still matching before
 * overwriting, and throwing a "changed since you loaded it" error if zero
 * rows matched.
 */

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
  sitExecutionOwnerId: string | null;
  uatExecutionOwnerId: string | null;
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
  // This engagement must have opted into file-tracked test cases (the
  // Settings toggle) before a package can be uploaded — otherwise issues
  // reference test cases via the legacy free-text `test_case_packages` list
  // instead (see app/actions/issues.ts's createIssue).
  if (!engagement.test_cases_enabled) {
    throw new Error('Turn on "Track test cases from uploaded files" in Settings before uploading a package.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Package name is required.');

  // Dynamically imported so the (large) xlsx library only loads into the
  // server bundle/cold-start path that actually needs it, not every Server
  // Action in this file.
  const XLSX = await import('xlsx');
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('The uploaded file has no sheets.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: null });

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
      // A pre-filled result from the uploaded sheet is a UAT baseline — UAT
      // is this app's always-present phase. A SIT tester, when SIT is
      // enabled, still starts from an untested step and records their own
      // independent result.
      uat_result: step.result,
    })),
  );
  if (stepsError) {
    // Best-effort cleanup, not a real rollback — the Supabase JS client has
    // no multi-statement transaction primitive.
    await supabase.from('test_packages').delete().eq('id', pkg.id);
    throw stepsError;
  }

  revalidatePath(`/${engagementId}/settings`);
  revalidatePath(`/${engagementId}/testing-lab`);
  return { packageId: pkg.id as string, stepCount: parsed.steps.length };
}

export async function deleteTestPackage(engagementId: string, packageId: string): Promise<void> {
  await requireProm();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .delete()
    .eq('id', packageId)
    .eq('engagement_id', engagementId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This test package could not be deleted — it may already be gone.');
  revalidatePath(`/${engagementId}/settings`);
  revalidatePath(`/${engagementId}/testing-lab`);
}

export type TestPackageName = { id: string; name: string };

export const listTestPackageNames = cache(async (engagementId: string): Promise<TestPackageName[]> => {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select('id, name')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as TestPackageName[];
});

export async function listTestPackages(engagementId: string): Promise<TestPackageSummary[]> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select('id, name, created_at, sit_execution_owner_id, uat_execution_owner_id, test_package_steps(count)')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      name: string;
      created_at: string;
      sit_execution_owner_id: string | null;
      uat_execution_owner_id: string | null;
      test_package_steps: { count: number }[];
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    stepCount: row.test_package_steps[0]?.count ?? 0,
    createdAt: row.created_at,
    sitExecutionOwnerId: row.sit_execution_owner_id,
    uatExecutionOwnerId: row.uat_execution_owner_id,
  }));
}

export async function setTestPackageExecutionOwner(
  packageId: string,
  phase: 'sit' | 'uat',
  ownerId: string | null,
): Promise<void> {
  await requireProm();
  const supabase = createServerClient();
  // Prometeia-assigned independently per phase — a package can have a
  // different SIT owner and UAT owner, or none, each drawn from that
  // phase's own roster (see app/actions/engagements.ts's listMembers).
  const column = phase === 'sit' ? 'sit_execution_owner_id' : 'uat_execution_owner_id';
  const { data, error } = await supabase
    .from('test_packages')
    .update({ [column]: ownerId })
    .eq('id', packageId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This test package could not be found.');
}

export type TestPackageStepDetail = {
  id: string;
  stepNumber: number;
  stepName: string;
  stepDescription: string;
  expectedOutcome: string;
  sitResult: TestResult | null;
  uatResult: TestResult | null;
};

export type TestPackageDetail = {
  id: string;
  name: string;
  sitExecutionOwnerId: string | null;
  uatExecutionOwnerId: string | null;
  steps: TestPackageStepDetail[];
};

export async function getTestPackageDetail(engagementId: string, packageId: string): Promise<TestPackageDetail> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select(
      'id, name, sit_execution_owner_id, uat_execution_owner_id, test_package_steps(id, step_number, step_name, step_description, expected_outcome, sit_result, uat_result)',
    )
    .eq('id', packageId)
    .eq('engagement_id', engagementId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This test package could not be found.');
  const row = data as unknown as {
    id: string;
    name: string;
    sit_execution_owner_id: string | null;
    uat_execution_owner_id: string | null;
    test_package_steps: {
      id: string;
      step_number: number;
      step_name: string;
      step_description: string;
      expected_outcome: string;
      sit_result: TestResult | null;
      uat_result: TestResult | null;
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
      sitResult: s.sit_result,
      uatResult: s.uat_result,
    }));
  return {
    id: row.id,
    name: row.name,
    sitExecutionOwnerId: row.sit_execution_owner_id,
    uatExecutionOwnerId: row.uat_execution_owner_id,
    steps,
  };
}

export async function updateTestStepResult(
  stepId: string,
  result: TestResult | null,
  previousResult: TestResult | null,
): Promise<void> {
  const session = await requireNonProm();
  const supabase = createServerClient();

  const { data: stepRow, error: stepError } = await supabase
    .from('test_package_steps')
    .select('test_packages!inner(engagement_id)')
    .eq('id', stepId)
    .single();
  if (stepError) throw stepError;
  const engagementId = (stepRow as unknown as { test_packages: { engagement_id: string } }).test_packages
    .engagement_id;

  // Which of this step's two result columns the actor may touch, based on
  // their own membership phase — mirrored (and re-derived independently,
  // not trusted from here) by the test_step_result_only trigger, which pins
  // the other phase's columns back to their old values regardless of what
  // this update's payload contains.
  const { data: membership, error: membershipError } = await supabase
    .from('engagement_members')
    .select('phase')
    .eq('engagement_id', engagementId)
    .eq('user_id', session.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  const isSit = membership?.phase === 'sit';
  const resultColumn = isSit ? 'sit_result' : 'uat_result';
  const updatedByColumn = isSit ? 'sit_result_updated_by' : 'uat_result_updated_by';
  const updatedAtColumn = isSit ? 'sit_result_updated_at' : 'uat_result_updated_at';

  // Optimistic-concurrency guard — see updateIssuePriority in app/actions/issues.ts
  // for the same pattern. Without conditioning on the result the caller last saw,
  // two testers submitting different results for the same step in a short window
  // would silently overwrite each other with no error to either side.
  let query = supabase
    .from('test_package_steps')
    .update({ [resultColumn]: result, [updatedByColumn]: session.id, [updatedAtColumn]: new Date().toISOString() })
    .eq('id', stepId);
  query = previousResult === null ? query.is(resultColumn, null) : query.eq(resultColumn, previousResult);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('This result changed since you loaded it. Please refresh and try again.');
  }
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

export type TestPackageResultStep = {
  sitResult: TestResult | null;
  sitResultUpdatedAt: string | null;
  uatResult: TestResult | null;
  uatResultUpdatedAt: string | null;
};

export type TestPackageWithResults = {
  id: string;
  name: string;
  sitExecutionOwnerId: string | null;
  uatExecutionOwnerId: string | null;
  steps: TestPackageResultStep[];
};

// Returns both phases' results for every step, unfiltered — callers (the
// dashboard) pick out sitResult or uatResult per their own selected phase
// when feeding lib/testPackageKpi.ts / lib/testPackageDashboard.ts (which
// only know about a single generic `result` field), and the raw per-owner
// data is also what the workload view is computed from.
export async function listTestPackagesWithResults(engagementId: string): Promise<TestPackageWithResults[]> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select(
      'id, name, sit_execution_owner_id, uat_execution_owner_id, test_package_steps(sit_result, sit_result_updated_at, uat_result, uat_result_updated_at)',
    )
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      name: string;
      sit_execution_owner_id: string | null;
      uat_execution_owner_id: string | null;
      test_package_steps: {
        sit_result: TestResult | null;
        sit_result_updated_at: string | null;
        uat_result: TestResult | null;
        uat_result_updated_at: string | null;
      }[];
    }[]
  ).map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    sitExecutionOwnerId: pkg.sit_execution_owner_id,
    uatExecutionOwnerId: pkg.uat_execution_owner_id,
    steps: pkg.test_package_steps.map((s) => ({
      sitResult: s.sit_result,
      sitResultUpdatedAt: s.sit_result_updated_at,
      uatResult: s.uat_result,
      uatResultUpdatedAt: s.uat_result_updated_at,
    })),
  }));
}
