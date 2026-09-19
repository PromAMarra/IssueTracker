import Link from 'next/link';
import type { TestPackageSummary } from '@/app/actions/testPackages';

export function PackageTabs({
  engagementId,
  packages,
  activePackageId,
}: {
  engagementId: string;
  packages: TestPackageSummary[];
  activePackageId: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-hairline pb-2">
      {packages.map((pkg) => (
        <Link
          key={pkg.id}
          href={`/${engagementId}/testing-lab?package=${pkg.id}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            pkg.id === activePackageId
              ? 'bg-brand-blue text-white'
              : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
          }`}
        >
          {pkg.name}
        </Link>
      ))}
    </div>
  );
}
