'use client';

import { useRouter } from 'next/navigation';
import type { EngagementSummary } from '@/lib/data/engagements';

/**
 * Header dropdown that lets the signed-in user jump between the engagements
 * (bank/client relationships) they belong to, and — for Prometeia users —
 * start a new one.
 *
 * Responsibility: purely a navigation control. `engagements` is expected to
 * already be scoped to what this user is allowed to see (RLS on the
 * engagements/memberships tables enforces that server-side); this component
 * does not re-check access. `canCreate` is a UX convenience (hide "+ New
 * engagement…" from non-Prometeia users) — actual creation is still gated by
 * the `createEngagement` Server Action / RLS, not by hiding this option.
 */
export function EngagementPicker({
  engagements,
  currentId,
  canCreate,
}: {
  engagements: EngagementSummary[];
  currentId: string;
  canCreate: boolean;
}) {
  const router = useRouter();

  return (
    <select
      value={currentId}
      onChange={(e) => {
        // '__new__' is a sentinel option value (see the canCreate branch
        // below), not a real engagement id — must be checked before treating
        // the value as a route segment.
        if (e.target.value === '__new__') router.push('/new-engagement');
        else router.push(`/${e.target.value}/board`);
      }}
      className="rounded-md border border-ink-soft/30 bg-white px-2 py-1 text-sm text-ink"
    >
      {engagements.map((e) => (
        <option key={e.id} value={e.id}>
          {e.bank_name} — {e.name}
        </option>
      ))}
      {canCreate && <option value="__new__">+ New engagement…</option>}
    </select>
  );
}
