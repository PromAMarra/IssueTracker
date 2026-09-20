'use client';

import { useRouter } from 'next/navigation';

export function TestPackageFilter({
  packages,
  activeId,
}: {
  packages: { id: string; name: string }[];
  activeId: string | null;
}) {
  const router = useRouter();
  return (
    <select
      value={activeId ?? ''}
      onChange={(e) => router.push(e.target.value ? `?view=testing&testPackage=${e.target.value}` : '?view=testing')}
      className="rounded-md border border-ink-soft/30 px-2 py-1 text-sm"
    >
      <option value="">All packages</option>
      {packages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
