'use client';

import { EngagementConfigForm, type EngagementConfigValues } from './EngagementConfigForm';
import { updateEngagementSettings } from '@/app/actions/engagements';

export function SettingsForm({
  engagementId,
  initial,
}: {
  engagementId: string;
  initial: EngagementConfigValues;
}) {
  return (
    <EngagementConfigForm
      initial={initial}
      submitLabel="Save changes"
      onSubmit={(values) => updateEngagementSettings(engagementId, values)}
    />
  );
}
