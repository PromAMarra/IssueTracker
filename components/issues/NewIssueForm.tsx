'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createIssue, uploadAttachment } from '@/app/actions/issues';
import type { Priority } from '@/lib/types';
import type { TeamMember } from '@/lib/data/engagements';
import type { TestCaseStepOption } from '@/app/actions/testPackages';

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

// Builds the { packageName: [stepName, ...] } grouping used to render
// <optgroup>s in the "Test case package" select when testCasesEnabled is on
// (i.e. packages/steps come from uploaded test files rather than the
// engagement's free-text testCasePackages list).
function groupStepOptionsByPackage(options: TestCaseStepOption[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const { packageName, stepName } of options) {
    (grouped[packageName] ??= []).push(stepName);
  }
  return grouped;
}

/**
 * "Report an issue" form, used both standalone-in-a-modal (`NewIssueModal`,
 * from Board/List) and embedded inline (`TestPackageView`, when opening a
 * ticket from a failed/passed-with-minor test step). Any signed-in user can
 * report an issue except Prometeia (see the domain rule: Prometeia has full
 * control but cannot report tickets) — this component itself does not
 * enforce that; it's on whoever decides to render it (Board/TestPackageView
 * gate the "Open ticket" entry points behind `!isProm` /
 * `canEditPhase`-style checks), and ultimately on RLS for `createIssue`.
 *
 * Two mutually exclusive "test case package" input modes, switched on
 * `testCasesEnabled` (an engagement-level setting): a free-text list of
 * package names (`testCasePackages`), or packages/steps derived from
 * uploaded test files (`testCaseStepOptions`, grouped by
 * `groupStepOptionsByPackage`). `initialTestCasePackage` pre-fills this field
 * when arriving from a specific failed test step in the Testing Lab.
 *
 * Gotcha: attachments chosen here are uploaded one-by-one, sequentially,
 * only *after* `createIssue` succeeds and returns an id — an issue can end
 * up created with zero attachments if any individual `uploadAttachment` call
 * fails partway through (see `handleSubmit`), and there's no rollback of the
 * already-created issue or already-uploaded files in that case.
 */
export function NewIssueForm({
  engagementId,
  modules,
  testCasePackages,
  testCasesEnabled,
  testCaseStepOptions,
  teamMembers,
  onCreated,
  initialTestCasePackage,
}: {
  engagementId: string;
  modules: string[];
  testCasePackages: string[];
  testCasesEnabled: boolean;
  testCaseStepOptions: TestCaseStepOption[];
  teamMembers: TeamMember[];
  onCreated?: () => void;
  initialTestCasePackage?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [module, setModule] = useState(modules[0] ?? '');
  const [testCasePackage, setTestCasePackage] = useState(
    initialTestCasePackage ?? (testCasesEnabled ? '' : (testCasePackages[0] ?? '')),
  );
  const [testCaseStep, setTestCaseStep] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupedStepOptions = useMemo(() => groupStepOptionsByPackage(testCaseStepOptions), [testCaseStepOptions]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const issueId = await createIssue({
        engagementId,
        title,
        description,
        priority,
        module: module || null,
        testCasePackage: testCasePackage || null,
        testCaseStep,
        assigneeId: assigneeId || null,
      });

      // Intentionally sequential (not Promise.all) so uploads don't hammer
      // Supabase Storage concurrently; each iteration awaits before starting
      // the next, hence the lint suppression below.
      for (const file of files) {
        const formData = new FormData();
        formData.set('file', file);
        // eslint-disable-next-line no-await-in-loop
        await uploadAttachment(issueId, engagementId, formData);
      }

      setTitle('');
      setDescription('');
      setTestCaseStep('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the issue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-hairline bg-white p-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
        Issue title
        <input
          required
          placeholder="Issue title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-ink-soft/30 px-3 py-2 text-sm font-normal text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
        Description
        <textarea
          required
          placeholder="What's wrong, and how to reproduce it"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded-md border border-ink-soft/30 px-3 py-2 text-sm font-normal text-ink"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-md border border-ink-soft/30 px-2 py-2 text-sm font-normal capitalize text-ink"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
          Module
          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="rounded-md border border-ink-soft/30 px-2 py-2 text-sm font-normal text-ink"
          >
            <option value="">No module</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
          Test case package
          <select
            value={testCasePackage}
            onChange={(e) => setTestCasePackage(e.target.value)}
            className="rounded-md border border-ink-soft/30 px-2 py-2 text-sm font-normal text-ink"
          >
            <option value="">No test case package</option>
            {testCasesEnabled
              ? Object.entries(groupedStepOptions).map(([packageName, stepNames]) => (
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
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
          Assign to (Prometeia)
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-md border border-ink-soft/30 px-2 py-2 text-sm font-normal text-ink"
          >
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
        Test case step (optional)
        <textarea
          placeholder="Test case step (optional)"
          value={testCaseStep}
          onChange={(e) => setTestCaseStep(e.target.value)}
          rows={2}
          className="rounded-md border border-ink-soft/30 px-3 py-2 text-sm font-normal text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
        Attachments (optional — cannot be added after the ticket is reported)
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          className="text-sm font-normal"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-md bg-brand-blue px-4 py-2 text-sm font-bold text-white hover:bg-primary-active disabled:opacity-60"
      >
        {submitting ? 'Reporting…' : 'Report issue'}
      </button>
    </form>
  );
}
