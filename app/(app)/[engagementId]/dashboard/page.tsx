import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listBankSitTeam } from '@/lib/data/engagements';
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
import { listTestPackagesWithResults, type TestPackageResultStep } from '@/app/actions/testPackages';
import { testPackageKpis } from '@/lib/testPackageKpi';
import { perPackageResultBreakdown, testedTrend } from '@/lib/testPackageDashboard';
import { computeWorkload, dailyTestsByOwner } from '@/lib/testWorkload';
import { TestedTrendChart } from '@/components/dashboard/TestedTrendChart';
import { PackageResultsChart } from '@/components/dashboard/PackageResultsChart';
import { TestPackageFilter } from '@/components/dashboard/TestPackageFilter';
import { WorkloadTable } from '@/components/dashboard/WorkloadTable';
import { DailyTestsByOwnerChart } from '@/components/dashboard/DailyTestsByOwnerChart';

/**
 * `[engagementId]/dashboard` — the KPI/reporting screen. It renders one of
 * two entirely different sub-dashboards depending on `?view=`:
 *   - "issues" (default): defect KPIs (open/closed counts, reopen rate,
 *     status/priority distributions, time-to-close, throughput, aging,
 *     module/org volume) computed by the pure functions in `lib/kpi.ts`
 *     from the raw issue + issue_history rows.
 *   - "testing": test-execution KPIs (percent tested/failed, tested-vs-pace
 *     trend, per-package pass/fail breakdown, per-owner workload and a
 *     tests-per-day chart) computed by `lib/testPackageKpi.ts`,
 *     `lib/testPackageDashboard.ts` and `lib/testWorkload.ts` from test
 *     package/step rows. Only reachable when `test_cases_enabled` is on for
 *     this engagement — the `view` variable below silently falls back to
 *     "issues" otherwise, so a stale `?view=testing` link on a since-toggled
 *     engagement doesn't render a broken/empty testing view.
 *
 * Both sub-dashboards additionally support `?phase=sit|uat` (only exposed
 * in the UI when `sit_expected` is true for this engagement) to scope the
 * numbers to one testing phase. This is purely a display-layer filter over
 * data already fetched for the whole engagement — it is not a security
 * boundary and every member can flip between phases freely.
 *
 * Data-fetch cost note: `allIssues`/`allHistory` are only fetched when
 * `view === 'issues'`, and `testPackages` only when `view === 'testing'` —
 * each view pays only for the queries its own charts need, since a single
 * request only ever renders one of the two views.
 *
 * Independent-per-phase test results (critical, since migration 0022):
 * `sit_result` and `uat_result` on a test_package_step are two separate
 * columns with their own tester/timestamp, not one shared verdict — SIT and
 * UAT can legitimately disagree on the same step. Every testing-view
 * computation below has to pick one explicitly (see `toSitResult` /
 * `toUatResult` / `toSelectedPhaseResult`); there is no single "the"
 * result to fall back to.
 */
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

  const engagement = await getEngagement(params.engagementId);
  // See board/page.tsx's header comment: null here means either "no such
  // engagement" or "RLS denied this user" — both are handled the same way.
  if (!engagement) redirect('/');

  // Falls back to "issues" whenever testing isn't enabled for this
  // engagement, even if the URL explicitly asks for `view=testing` — see
  // the file header for why this matters for stale/shared links.
  const view = searchParams.view === 'testing' && engagement.test_cases_enabled ? 'testing' : 'issues';

  // Only fetch what the active view actually renders — avoids paying for
  // issue/history queries on a testing-view request and vice versa below.
  const [allIssues, allHistory]: [Awaited<ReturnType<typeof listIssues>>, Awaited<ReturnType<typeof listHistoryForEngagement>>] =
    view === 'issues'
      ? await Promise.all([listIssues(params.engagementId), listHistoryForEngagement(params.engagementId)])
      : [[], []];

  const phase = searchParams.phase === 'sit' || searchParams.phase === 'uat' ? searchParams.phase : null;
  // Prometeia-reported issues aren't owned by either testing phase, so they
  // stay visible regardless of which phase filter is selected.
  const issues = phase ? allIssues.filter((i) => i.org === PHASE_ORG[phase] || i.org === 'prometeia') : allIssues;
  // Derive the id set from the already-phase-filtered issues (not from a
  // separate query) so history rows are scoped to exactly the same set of
  // issues the KPI tiles/charts above are computed from.
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
  // An engagement with SIT disabled should never have SIT-org issues, but
  // strip that bucket defensively so a leftover/mis-tagged row can't make a
  // phase the engagement doesn't use appear in the volume-by-org chart.
  const orgVol = engagement.sit_expected
    ? orgVolume(issues)
    : orgVolume(issues).filter((d) => d.org !== 'sit');
  const aging = agingReport(issues, engagement.sla_days, now);
  const timeInStatus = timeInStatusByPriority(issues, history, now);

  // A period is only usable once BOTH dates are configured in Settings —
  // a half-configured period (e.g. start set, end still blank) is treated
  // the same as "not configured", not as an open-ended range.
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
  // Same phase filter as Issue Insights, but every link has to keep
  // `view=testing` — reusing phaseLink/phaseClass as-is would drop back to
  // the Issue Insights view on click.
  const testingPhaseLink = (value: 'sit' | 'uat' | null) =>
    value ? `?view=testing&phase=${value}` : '?view=testing';
  const testingPhaseClass = (value: 'sit' | 'uat' | null) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      phase === value ? 'bg-brand-blue text-white' : 'border border-ink-soft/30 text-ink hover:bg-primary-soft'
    }`;

  const [testPackages, bankSitTeam] =
    view === 'testing'
      ? await Promise.all([listTestPackagesWithResults(params.engagementId), listBankSitTeam(params.engagementId)])
      : [[], []];
  const testPackageFilter =
    searchParams.testPackage && testPackages.some((p) => p.id === searchParams.testPackage)
      ? searchParams.testPackage
      : null;
  const filteredTestPackages = testPackageFilter
    ? testPackages.filter((p) => p.id === testPackageFilter)
    : testPackages;

  // sit_result and uat_result are independent testing efforts, not one
  // shared answer — every phase-scoped view below picks one explicitly.
  // "All" (no phase selected) falls back to UAT, this app's always-present
  // phase, for the KPI tiles and the per-package breakdown chart; the trend
  // charts don't need a fallback since SIT and UAT already render as two
  // separate panels.
  const toSitResult = (s: TestPackageResultStep) => ({ result: s.sitResult, resultUpdatedAt: s.sitResultUpdatedAt });
  const toUatResult = (s: TestPackageResultStep) => ({ result: s.uatResult, resultUpdatedAt: s.uatResultUpdatedAt });
  const toSelectedPhaseResult = phase === 'sit' ? toSitResult : toUatResult;

  const allTestSteps = filteredTestPackages.flatMap((p) => p.steps).map(toSelectedPhaseResult);
  const testKpis = testPackageKpis(allTestSteps);
  const sitTestSteps = filteredTestPackages.flatMap((p) => p.steps).map(toSitResult);
  const uatTestSteps = filteredTestPackages.flatMap((p) => p.steps).map(toUatResult);
  const testSitTrend =
    sitPeriod && engagement.sit_expected ? testedTrend(sitTestSteps, sitPeriod.start, sitPeriod.end, now) : null;
  const testUatTrend = uatPeriod ? testedTrend(uatTestSteps, uatPeriod.start, uatPeriod.end, now) : null;
  const packageBreakdown = perPackageResultBreakdown(
    testPackages.map((p) => ({ name: p.name, steps: p.steps.map(toSelectedPhaseResult) })),
  );
  const workloadRows = computeWorkload(testPackages, bankSitTeam);
  // Only chart owners who actually have workload rows (i.e. steps
  // assigned/attributed to them) — a phase's full roster may include
  // members who haven't been given execution ownership of anything yet,
  // and they'd otherwise show up as an owner with an empty, misleading
  // all-zero series.
  const sitOwners = bankSitTeam.filter((m) => m.phase === 'sit' && workloadRows.some((r) => r.userId === m.id));
  const uatOwners = bankSitTeam.filter((m) => m.phase === 'uat' && workloadRows.some((r) => r.userId === m.id));
  // SIT's per-day series additionally requires sit_expected — an engagement
  // with SIT turned off has no SIT roster/phase to attribute tests to, even
  // if a sitPeriod date range were somehow still configured.
  const sitDailyTests =
    sitPeriod && engagement.sit_expected
      ? dailyTestsByOwner(testPackages, bankSitTeam, 'sit', sitPeriod.start, sitPeriod.end)
      : [];
  const uatDailyTests = uatPeriod
    ? dailyTestsByOwner(testPackages, bankSitTeam, 'uat', uatPeriod.start, uatPeriod.end)
    : [];

  return (
    <div className="flex flex-col gap-6">
      {view === 'issues' && (
        <>
          <div className={`flex items-center gap-2 ${engagement.sit_expected ? 'justify-between' : 'justify-end'}`}>
            {engagement.sit_expected && (
              <div className="flex gap-1">
                <Link href={phaseLink(null)} className={phaseClass(null)}>
                  All
                </Link>
                <Link href={phaseLink('sit')} className={phaseClass('sit')}>
                  SIT
                </Link>
                <Link href={phaseLink('uat')} className={phaseClass('uat')}>
                  UAT
                </Link>
              </div>
            )}
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
              {engagement.sit_expected && (
                <div className="flex gap-1">
                  <Link href={testingPhaseLink(null)} className={testingPhaseClass(null)}>
                    All
                  </Link>
                  <Link href={testingPhaseLink('sit')} className={testingPhaseClass('sit')}>
                    SIT
                  </Link>
                  <Link href={testingPhaseLink('uat')} className={testingPhaseClass('uat')}>
                    UAT
                  </Link>
                </div>
              )}
              <TestPackageFilter
                packages={testPackages.map((p) => ({ id: p.id, name: p.name }))}
                activeId={testPackageFilter}
              />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatTile label="Total tests" value={String(testKpis.total)} />
                <StatTile label="% tested" value={`${testKpis.testedPercent}%`} />
                <StatTile label="% failed" value={`${testKpis.failedPercent}%`} />
                <StatTile label="% to be tested" value={`${testKpis.toBeTestedPercent}%`} />
              </div>
              {!testSitTrend && !testUatTrend ? (
                <div className="rounded-lg border border-hairline bg-white p-4">
                  <h3 className="mb-1 text-sm font-bold text-ink">Tested vs. target pace</h3>
                  <p className="text-sm text-ink-soft">
                    Configure SIT and/or UAT testing period dates in Settings to see this chart.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {(phase === null || phase === 'sit') && testSitTrend && sitPeriod && (
                    <TestedTrendChart label="SIT" period={sitPeriod} points={testSitTrend} />
                  )}
                  {(phase === null || phase === 'uat') && testUatTrend && uatPeriod && (
                    <TestedTrendChart label="UAT" period={uatPeriod} points={testUatTrend} />
                  )}
                </div>
              )}
              <PackageResultsChart data={packageBreakdown} />
              <WorkloadTable rows={workloadRows} />
              <div className="flex flex-col gap-4">
                <DailyTestsByOwnerChart label="SIT" points={sitDailyTests} owners={sitOwners} />
                <DailyTestsByOwnerChart label="UAT" points={uatDailyTests} owners={uatOwners} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
