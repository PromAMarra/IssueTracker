import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listHistoryForEngagement, listIssues } from '@/lib/data/issues';
import {
  agingReport,
  moduleVolume,
  orgVolume,
  priorityDistribution,
  reopenRate,
  statusDistribution,
  throughputByWeek,
  timeToCloseByPriority,
} from '@/lib/kpi';
import { StatTile } from '@/components/dashboard/StatTile';
import { StatusDistributionChart } from '@/components/dashboard/StatusDistributionChart';
import { PriorityDistributionChart } from '@/components/dashboard/PriorityDistributionChart';
import { TimeToCloseChart } from '@/components/dashboard/TimeToCloseChart';
import { ThroughputChart } from '@/components/dashboard/ThroughputChart';
import { AgingReportTable } from '@/components/dashboard/AgingReportTable';
import { ModuleVolumeChart } from '@/components/dashboard/ModuleVolumeChart';
import { OrgVolumeChart } from '@/components/dashboard/OrgVolumeChart';

export default async function DashboardPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues, history] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listHistoryForEngagement(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  const openCount = issues.filter((i) => i.status !== 'closed' && i.status !== 'rejected').length;
  const closedCount = issues.filter((i) => i.status === 'closed').length;
  const reopen = reopenRate(issues, history);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total issues" value={String(issues.length)} />
        <StatTile label="Open" value={String(openCount)} />
        <StatTile label="Closed" value={String(closedCount)} />
        <StatTile
          label="Reopen rate"
          value={`${reopen.ratePercent.toFixed(0)}%`}
          sublabel={`${reopen.reopenedCount} of ${reopen.everClosedCount} closed`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDistributionChart distribution={statusDistribution(issues)} />
        <PriorityDistributionChart distribution={priorityDistribution(issues)} />
      </div>
      <TimeToCloseChart rows={timeToCloseByPriority(issues, engagement.sla_days)} />
      <ThroughputChart buckets={throughputByWeek(issues, 8, now)} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ModuleVolumeChart data={moduleVolume(issues)} />
        <OrgVolumeChart data={orgVolume(issues)} />
      </div>
      <AgingReportTable rows={agingReport(issues, engagement.sla_days, now)} />
    </div>
  );
}
