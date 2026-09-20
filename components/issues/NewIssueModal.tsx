'use client';

import { useState } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import { NewIssueForm } from './NewIssueForm';
import type { TeamMember } from '@/lib/data/engagements';
import type { TestCaseStepOption } from '@/app/actions/testPackages';

export function NewIssueModal({
  engagementId,
  modules,
  testCasePackages,
  testCasesEnabled,
  testCaseStepOptions,
  teamMembers,
}: {
  engagementId: string;
  modules: string[];
  testCasePackages: string[];
  testCasesEnabled: boolean;
  testCaseStepOptions: TestCaseStepOption[];
  teamMembers: TeamMember[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-2 rounded-md bg-brand-blue px-4 py-2 text-sm font-bold text-white hover:bg-primary-active"
      >
        <IconPlus className="h-4 w-4" stroke={1.5} />
        Open A Ticket
      </button>
      {open && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-ink">New Ticket</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-primary-soft hover:text-ink"
                aria-label="Close"
              >
                <IconX className="h-4 w-4" stroke={1.5} />
              </button>
            </div>
            <NewIssueForm
              engagementId={engagementId}
              modules={modules}
              testCasePackages={testCasePackages}
              testCasesEnabled={testCasesEnabled}
              testCaseStepOptions={testCaseStepOptions}
              teamMembers={teamMembers}
              onCreated={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
