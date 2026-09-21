'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

type Phase = 'sit' | 'uat';

export function TestPackageView({
  engagementId,
  detail,
  isProm,
  modules,
  teamMembers,
  testCasesEnabled,
  testCaseStepOptions,
  sitExpected,
  userOwnPhase,
  sitExecutionOwnerName,
  uatExecutionOwnerName,
}: {
  engagementId: string;
  detail: TestPackageDetail;
  isProm: boolean;
  modules: string[];
  teamMembers: TeamMember[];
  testCasesEnabled: boolean;
  testCaseStepOptions: TestCaseStepOption[];
  sitExpected: boolean;
  userOwnPhase: Phase | null;
  sitExecutionOwnerName: string | null;
  uatExecutionOwnerName: string | null;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState(detail.steps);
  const [phase, setPhase] = useState<Phase>(sitExpected && userOwnPhase === 'sit' ? 'sit' : 'uat');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticketStepName, setTicketStepName] = useState<string | null>(null);

  // A real navigation/reload gives us a fresh server-fetched array — resync
  // to it rather than keep patching indefinitely on top of a stale base.
  useEffect(() => {
    setSteps(detail.steps);
  }, [detail.steps]);

  // Quick edits below patch just the one changed step locally instead of
  // re-fetching the whole package (updateTestStepResult calls no
  // revalidatePath — see the comment block on updateIssueStatus in
  // app/actions/issues.ts for why). Refreshing when the tab regains focus
  // covers the common case — coming back to this view after being away —
  // without paying the full re-fetch cost on every local edit.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') router.refresh();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [router]);

  // Only the phase's own steps feed the KPI tiles — sit_result and
  // uat_result are independent testing efforts, not one shared answer.
  const phaseSteps = steps.map((s) => ({ result: phase === 'sit' ? s.sitResult : s.uatResult }));
  const kpis = testPackageKpis(phaseSteps);
  const canEditPhase = !isProm && phase === userOwnPhase;
  const executionOwnerName = phase === 'sit' ? sitExecutionOwnerName : uatExecutionOwnerName;

  async function handleResultChange(stepId: string, result: TestResult | null) {
    const step = steps.find((s) => s.id === stepId);
    const previousResult = (phase === 'sit' ? step?.sitResult : step?.uatResult) ?? null;
    const field = phase === 'sit' ? 'sitResult' : 'uatResult';
    setPendingId(stepId);
    setError(null);
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, [field]: result } : s)));
    try {
      await updateTestStepResult(stepId, result, previousResult);
    } catch (err) {
      setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, [field]: previousResult } : s)));
      setError(err instanceof Error ? err.message : 'Could not save this result.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sitExpected && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPhase('sit')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                phase === 'sit' ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
              }`}
            >
              SIT
            </button>
            <button
              type="button"
              onClick={() => setPhase('uat')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                phase === 'uat' ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
              }`}
            >
              UAT
            </button>
          </div>
          {executionOwnerName && (
            <span className="text-xs text-ink-soft">
              {phase === 'sit' ? 'SIT' : 'UAT'} execution owner: <span className="font-medium text-ink">{executionOwnerName}</span>
            </span>
          )}
        </div>
      )}

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
              <th scope="col" className="px-3 py-2">#</th>
              <th scope="col" className="px-3 py-2">Step</th>
              <th scope="col" className="px-3 py-2">Description</th>
              <th scope="col" className="px-3 py-2">Expected outcome</th>
              <th scope="col" className="px-3 py-2">Result</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => {
              const result = phase === 'sit' ? step.sitResult : step.uatResult;
              return (
                <tr key={step.id} className="border-b border-hairline/60 align-top">
                  <td className="px-3 py-2 font-mono text-ink-soft">{step.stepNumber}</td>
                  <td className="px-3 py-2 font-medium text-ink">{step.stepName}</td>
                  <td className="max-w-md whitespace-pre-wrap px-3 py-2 text-ink-soft">{step.stepDescription}</td>
                  <td className="max-w-xs whitespace-pre-wrap px-3 py-2 text-ink-soft">{step.expectedOutcome}</td>
                  <td className="px-3 py-2">
                    {canEditPhase ? (
                      <select
                        value={result ?? ''}
                        disabled={pendingId === step.id}
                        onChange={(e) => handleResultChange(step.id, (e.target.value || null) as TestResult | null)}
                        aria-label={`Result for ${step.stepName}`}
                        className="rounded-md border border-ink-soft/30 px-2 py-1 text-xs font-normal"
                      >
                        <option value="">Not tested</option>
                        {TEST_RESULTS.map((r) => (
                          <option key={r} value={r}>
                            {TEST_RESULT_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <ResultBadge result={result} />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canEditPhase && (result === 'failed' || result === 'passed_with_minor') && (
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
              );
            })}
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
