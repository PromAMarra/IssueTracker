'use client';

import { useRouter } from 'next/navigation';
import { EngagementConfigForm } from './EngagementConfigForm';
import { createEngagement } from '@/app/actions/engagements';

/**
 * Default field values for a brand-new engagement. Kept in sync with
 * `EngagementConfigValues` in `EngagementConfigForm` — if a field is added
 * there, it must get a sensible default here too, or this form will pass
 * `undefined` for it to `createEngagement`.
 */
const EMPTY = {
  name: '',
  bankName: '',
  keyPrefix: '',
  modules: [] as string[],
  testCasePackages: [] as string[],
  slaDays: { critical: 2, high: 5, medium: 10, low: 20 },
  sitStartDate: null as string | null,
  sitEndDate: null as string | null,
  uatStartDate: null as string | null,
  uatEndDate: null as string | null,
  sitExpected: true,
  testCasesEnabled: false,
};

/**
 * "Create a new engagement" wrapper around `EngagementConfigForm`. Only
 * reachable via `EngagementPicker`'s "+ New engagement…" option, which is
 * itself only shown to Prometeia users — but as with the picker, that's a
 * UX convenience, not the enforcement; `createEngagement` / RLS is what
 * actually decides whether the current user may create an engagement.
 * On success, navigates straight into the new engagement's Board.
 */
export function NewEngagementForm() {
  const router = useRouter();
  return (
    <EngagementConfigForm
      initial={EMPTY}
      submitLabel="Create engagement"
      onSubmit={async (values) => {
        const id = await createEngagement(values);
        router.push(`/${id}/board`);
      }}
    />
  );
}
