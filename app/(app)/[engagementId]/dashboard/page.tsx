import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { priorityDistribution, statusDistribution } from '@/lib/kpi';
import { StatTile } from '@/components/dashboard/StatTile';
import { StatusDistributionChart } from '@/components/dashboard/StatusDistributionChart';
import { PriorityDistributionChart } from '@/components/dashboard/PriorityDistributionChart';

export default async function DashboardPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  const openCount = issues.filter((i) => i.status !== 'closed' && i.status !== 'rejected').length;
  const closedCount = issues.filter((i) => i.status === 'closed').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Total issues" value={String(issues.length)} />
        <StatTile label="Open" value={String(openCount)} />
        <StatTile label="Closed" value={String(closedCount)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDistributionChart distribution={statusDistribution(issues)} />
        <PriorityDistributionChart distribution={priorityDistribution(issues)} />
      </div>
    </div>
  );
}
