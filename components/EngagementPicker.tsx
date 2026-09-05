'use client';

import { useRouter } from 'next/navigation';
import type { EngagementSummary } from '@/lib/data/engagements';

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
        if (e.target.value === '__new__') router.push('/new-engagement');
        else router.push(`/${e.target.value}/board`);
      }}
      className="rounded border border-white/20 bg-brand-navy-2 px-2 py-1 text-sm text-white"
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
