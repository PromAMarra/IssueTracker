import { redirect } from 'next/navigation';
import Link from 'next/link';
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
  timeInStatusByPriority,
  timeToCloseByPriority,
} from '@/lib/kpi';
import { StatTile } from '@/components/dashboard/StatTile';
import { StatusDistributionChart } from '@/components/dashboard/StatusDistributionChart';
import { PriorityDistributionChart } from '@/components/dashboard/PriorityDistributionChart';
import { TimeToCloseChart } from '@/components/dashboard/TimeToCloseChart';
import { TimeInStatusTable } from '@/components/dashboard/TimeInStatusTable';
import { ThroughputChart } from '@/components/dashboard/ThroughputChart';
import { DailyDefectsChart } from '@/components/dashboard/DailyDefectsChart';
import { AgingReportTable } from '@/components/dashboard/AgingReportTable';
import { ModuleVolumeChart } from '@/components/dashboard/ModuleVolumeChart';
import { OrgVolumeChart } from '@/components/dashboard/OrgVolumeChart';
import { ExportDashboardButton } from '@/components/dashboard/ExportDashboardButton';
import { ExportPdfButton } from '@/components/dashboard/ExportPdfButton';
import { listTestPackagesWithResults } from '@/app/actions/testPackages';
import { testPackageKpis } from '@/lib/testPackageKpi';
import { perPackageResultBreakdown, testedTrend } from '@/lib/testPackageDashboard';
import { TestedTrendChart } from '@/components/dashboard/TestedTrendChart';
import { PackageResultsChart } from '@/components/dashboard/PackageResultsChart';

const PHASE_ORG: Record<'sit' | 'uat', 'sit' | 'bank'> = { sit: 'sit', uat: 'bank' };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { phase?: string; view?: string; testPackage?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, allIssues, allHistory] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listHistoryForEngagement(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  const phase = searchParams.phase === 'sit' || searchParams.phase === 'uat' ? searchParams.phase : null;
  // Prometeia-reported issues aren't owned by either testing phase, so they
  // stay visible regardless of which phase filter is selected.
  const issues = phase ? allIssues.filter((i) => i.org === PHASE_ORG[phase] || i.org === 'prometeia') : allIssues;
  const issueIds = new Set(issues.map((i) => i.id));
  const history = phase ? allHistory.filter((h) => issueIds.has(h.issue_id)) : allHistory;

  const openCount = issues.filter((i) => i.status !== 'closed' && i.status !== 'rejected').length;
  const closedCount = issues.filter((i) => i.status === 'closed').length;
  const reopen = reopenRate(issues, history);
  const now = new Date();

  const statusDist = statusDistribution(issues);
  const priorityDist = priorityDistribution(issues);
  const timeToClose = timeToCloseByPriority(issues, engagement.sla_days);
  const throughput = throughputByWeek(issues, 8, now);
  const moduleVol = moduleVolume(issues);
  const orgVol = engagement.sit_expected
    ? orgVolume(issues)
    : orgVolume(issues).filter((d) => d.org !== 'sit');
  const aging = agingReport(issues, engagement.sla_days, now);
  const timeInStatus = timeInStatusByPriority(issues, history, now);

  const sitPeriod =
    engagement.sit_start_date && engagement.sit_end_date
      ? { start: engagement.sit_start_date, end: engagement.sit_end_date }
      : null;
  const uatPeriod =
    engagement.uat_start_date && engagement.uat_end_date
      ? { start: engagement.uat_start_date, end: engagement.uat_end_date }
      : null;
  const sitDaily = sitPeriod ? dailyDefects(issues, sitPeriod.start, sitPeriod.end, now) : [];
  const uatDaily = uatPeriod ? dailyDefects(issues, uatPeriod.start, uatPeriod.end, now) : [];

  const phaseLink = (value: 'sit' | 'uat' | null) => (value ? `?phase=${value}` : '?');
  const phaseClass = (value: 'sit' | 'uat' | null) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      phase === value ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
    }`;

  const view = searchParams.view === 'testing' && engagement.test_cases_enabled ? 'testing' : 'issues';
  const testPackages = view === 'testing' ? await listTestPackagesWithResults(params.engagementId) : [];
  const testPackageFilter =
    searchParams.testPackage && testPackages.some((p) => p.id === searchParams.testPackage)
      ? searchParams.testPackage
      : null;
  const filteredTestPackages = testPackageFilter
    ? testPackages.filter((p) => p.id === testPackageFilter)
    : testPackages;
  const allTestSteps = filteredTestPackages.flatMap((p) => p.steps);
  const testKpis = testPackageKpis(allTestSteps);
  const testSitTrend = sitPeriod ? testedTrend(allTestSteps, sitPeriod.start, sitPeriod.end, now) : null;
  const testUatTrend = uatPeriod ? testedTrend(allTestSteps, uatPeriod.start, uatPeriod.end, now) : null;
  const packageBreakdown = perPackageResultBreakdown(testPackages);

  const viewLink = (value: 'issues' | 'testing') => (value === 'issues' ? '?' : '?view=testing');
  const viewClass = (value: 'issues' | 'testing') =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      view === value ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
    }`;
  const testPackageLink = (id: string | null) => (id ? `?view=testing&testPackage=${id}` : '?view=testing');
  const testPackageClass = (id: string | null) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      testPackageFilter === id ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
    }`;

  return (
    <div className="flex flex-col gap-6">
      {engagement.test_cases_enabled && (
        <div className="flex gap-1 border-b border-hairline pb-3">
          <Link href={viewLink('issues')} className={viewClass('issues')}>
            Issue Insights
          </Link>
          <Link href={viewLink('testing')} className={viewClass('testing')}>
            Testing Insights
          </Link>
        </div>
      )}

      {view === 'issues' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Link href={phaseLink(null)} className={phaseClass(null)}>
                All
              </Link>
              {engagement.sit_expected && (
                <Link href={phaseLink('sit')} className={phaseClass('sit')}>
                  SIT
                </Link>
              )}
              <Link href={phaseLink('uat')} className={phaseClass('uat')}>
                UAT
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <ExportDashboardButton
                engagementName={engagement.name}
                statusDist={statusDist}
                priorityDist={priorityDist}
                timeToClose={timeToClose}
                timeInStatus={timeInStatus}
                throughput={throughput}
                aging={aging}
                moduleVol={moduleVol}
                orgVol={orgVol}
                sitDaily={sitDaily}
                uatDaily={uatDaily}
              />
              <ExportPdfButton targetId="dashboard-export-root" engagementName={engagement.name} />
            </div>
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
            <DailyDefectsChart issues={issues} sitPeriod={sitPeriod} uatPeriod={uatPeriod} forcedPhase={phase} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <StatusDistributionChart distribution={statusDist} />
              <PriorityDistributionChart distribution={priorityDist} />
            </div>
            <TimeToCloseChart rows={timeToClose} />
            <TimeInStatusTable rows={timeInStatus} />
            <ThroughputChart buckets={throughput} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ModuleVolumeChart data={moduleVol} />
              <OrgVolumeChart data={orgVol} />
            </div>
            <AgingReportTable rows={aging} />
          </div>
        </>
      )}

      {view === 'testing' && (
        <div className="flex flex-col gap-6">
          {testPackages.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No test packages uploaded yet — ask Prometeia to upload one in Settings.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                <Link href={testPackageLink(null)} className={testPackageClass(null)}>
                  All packages
                </Link>
                {testPackages.map((p) => (
                  <Link key={p.id} href={testPackageLink(p.id)} className={testPackageClass(p.id)}>
                    {p.name}
                  </Link>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatTile label="Total tests" value={String(testKpis.total)} />
                <StatTile label="% tested" value={`${testKpis.testedPercent}%`} />
                <StatTile label="% failed" value={`${testKpis.failedPercent}%`} />
                <StatTile label="% to be tested" value={`${testKpis.toBeTestedPercent}%`} />
              </div>
              {!sitPeriod && !uatPeriod ? (
                <div className="rounded-lg border border-hairline bg-white p-4">
                  <h3 className="mb-1 text-sm font-bold text-ink">Tested vs. target pace</h3>
                  <p className="text-sm text-ink-soft">
                    Configure SIT and/or UAT testing period dates in Settings to see this chart.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {sitPeriod && testSitTrend && <TestedTrendChart label="SIT" period={sitPeriod} points={testSitTrend} />}
                  {uatPeriod && testUatTrend && <TestedTrendChart label="UAT" period={uatPeriod} points={testUatTrend} />}
                </div>
              )}
              <PackageResultsChart data={packageBreakdown} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
