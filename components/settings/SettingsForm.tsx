'use client';

import { EngagementConfigForm, type EngagementConfigValues } from './EngagementConfigForm';
import { updateEngagementSettings } from '@/app/actions/engagements';

/**
 * Thin wrapper that binds the shared `EngagementConfigForm` to the "edit an
 * existing engagement" Server Action (`updateEngagementSettings`). See
 * `NewEngagementForm` for the sibling "create" wrapper — both forms share
 * all field rendering/validation via `EngagementConfigForm` and differ only
 * in initial values and what `onSubmit` does with the result.
 */
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
