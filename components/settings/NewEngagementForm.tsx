'use client';

import { useRouter } from 'next/navigation';
import { EngagementConfigForm } from './EngagementConfigForm';
import { createEngagement } from '@/app/actions/engagements';

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
};

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
