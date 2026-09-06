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
  teamMembers: [] as string[],
  slaDays: { critical: 2, high: 5, medium: 10, low: 20 },
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
