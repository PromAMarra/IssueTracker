'use server';

import { cache } from 'react';
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

export async function getTestPackageDetail(engagementId: string, packageId: string): Promise<TestPackageDetail> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('test_packages')
    .select(
      'id, name, test_package_steps(id, step_number, step_name, step_description, expected_outcome, result)',
    )
    .eq('id', packageId)
    .eq('engagement_id', engagementId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This test package could not be found.');
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

export async function updateTestStepResult(
  stepId: string,
  result: TestResult | null,
  previousResult: TestResult | null,
): Promise<void> {
  const session = await requireNonProm();
  const supabase = createServerClient();
  // Optimistic-concurrency guard — see updateIssuePriority in app/actions/issues.ts
  // for the same pattern. Without conditioning on the result the caller last saw,
  // two testers submitting different results for the same step in a short window
  // would silently overwrite each other with no error to either side.
  let query = supabase
    .from('test_package_steps')
    .update({ result, result_updated_by: session.id, result_updated_at: new Date().toISOString() })
    .eq('id', stepId);
  query = previousResult === null ? query.is('result', null) : query.eq('result', previousResult);
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
