'use client';

import { useRouter } from 'next/navigation';

/**
 * TestPackageFilter — Testing Insights dashboard control (client component).
 *
 * A `<select>` that scopes every widget on the Testing Insights view to a
 * single test package (or back to "All packages"). It carries no local
 * state: choosing an option pushes a new URL (`?view=testing`, with or
 * without `&testPackage=<id>`), and the dashboard page (a server component)
 * re-renders with the filtered data — this keeps the filter shareable via
 * URL and consistent with the page's other query-string-driven filters
 * (`phase`, `view`).
 *
 * Gotcha: navigating always resets to the plain `testing` view URL, so
 * switching test packages while filtered to SIT/UAT silently drops the
 * `phase` query param and returns the user to "All".
 */
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
      // Empty value ("All packages") drops the testPackage param entirely
      // rather than sending an empty one, so the dashboard page's
      // `searchParams.testPackage` check sees "not set" instead of "set to
      // an empty string".
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
