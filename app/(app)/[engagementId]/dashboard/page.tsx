import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listHistoryForEngagement, listIssues } from '@/lib/data/issues';
import {
  agingReport,
  dailyDefects,
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
import { DailyDefectsChart } from '@/components/dashboard/DailyDefectsChart';
import { AgingReportTable } from '@/components/dashboard/AgingReportTable';
import { ModuleVolumeChart } from '@/components/dashboard/ModuleVolumeChart';
import { OrgVolumeChart } from '@/components/dashboard/OrgVolumeChart';
import { ExportDashboardButton } from '@/components/dashboard/ExportDashboardButton';
import { ExportPdfButton } from '@/components/dashboard/ExportPdfButton';

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

  const statusDist = statusDistribution(issues);
  const priorityDist = priorityDistribution(issues);
  const timeToClose = timeToCloseByPriority(issues, engagement.sla_days);
  const throughput = throughputByWeek(issues, 8, now);
  const moduleVol = moduleVolume(issues);
  const orgVol = orgVolume(issues);
  const aging = agingReport(issues, engagement.sla_days, now);

  const sitPeriod =
    engagement.sit_start_date && engagement.sit_end_date
      ? { start: engagement.sit_start_date, end: engagement.sit_end_date }
      : null;
  const uatPeriod =
    engagement.uat_start_date && engagement.uat_end_date
      ? { start: engagement.uat_start_date, end: engagement.uat_end_date }
      : null;
  const sitDaily = sitPeriod ? dailyDefects(issues, sitPeriod.start, sitPeriod.end) : [];
  const uatDaily = uatPeriod ? dailyDefects(issues, uatPeriod.start, uatPeriod.end) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end gap-2">
        <ExportDashboardButton
          engagementName={engagement.name}
          statusDist={statusDist}
          priorityDist={priorityDist}
          timeToClose={timeToClose}
          throughput={throughput}
          aging={aging}
          moduleVol={moduleVol}
          orgVol={orgVol}
          sitDaily={sitDaily}
          uatDaily={uatDaily}
        />
        <ExportPdfButton targetId="dashboard-export-root" engagementName={engagement.name} />
      </div>
      <div id="dashboard-export-root" className="flex flex-col gap-6">
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
        <DailyDefectsChart issues={issues} sitPeriod={sitPeriod} uatPeriod={uatPeriod} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatusDistributionChart distribution={statusDist} />
          <PriorityDistributionChart distribution={priorityDist} />
        </div>
        <TimeToCloseChart rows={timeToClose} />
        <ThroughputChart buckets={throughput} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ModuleVolumeChart data={moduleVol} />
          <OrgVolumeChart data={orgVol} />
        </div>
        <AgingReportTable rows={aging} />
      </div>
    </div>
  );
}
