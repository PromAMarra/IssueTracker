import type { TestResult } from './types';

/**
 * Pure analytics functions for the "who owns what" side of Testing Insights:
 * per-owner workload (assigned/tested/remaining step counts) and a
 * per-owner, per-day tested-steps series for the tests-per-day chart. Feeds
 * app/(app)/[engagementId]/dashboard/page.tsx and
 * components/dashboard/WorkloadTable.tsx / DailyTestsByOwnerChart.tsx.
 *
 * Ownership model: `test_packages.sit_execution_owner_id` and
 * `uat_execution_owner_id` are independent, Prometeia-assigned fields — one
 * package can have a different owner per phase (or none). A `WorkloadMember`
 * is scoped to exactly one phase (`engagement_members.phase`), reflecting
 * that a Bank/SIT user's phase is fixed for an engagement (see
 * lib/issueAccess.ts's header for how `phase` fits into the wider access
 * model); this module never needs to reconcile a member appearing as both a
 * SIT and a UAT owner because the caller is expected to pass in members
 * already filtered/tagged by their one phase.
 */
export type WorkloadStep = {
  sitResult: TestResult | null;
  sitResultUpdatedAt?: string | null;
  uatResult: TestResult | null;
  uatResultUpdatedAt?: string | null;
};

export type WorkloadPackage = {
  sitExecutionOwnerId: string | null;
  uatExecutionOwnerId: string | null;
  steps: WorkloadStep[];
};

export type WorkloadMember = { id: string; name: string; phase: 'sit' | 'uat' };

export type WorkloadRow = {
  userId: string;
  userName: string;
  phase: 'sit' | 'uat';
  assignedSteps: number;
  testedSteps: number;
  remainingSteps: number;
  testedPercent: number;
};

function percent(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

// Per execution owner (per phase they own), how many steps they're
// responsible for across every package that names them as that phase's
// owner, and how many of those they've already tested. Owners with nothing
// assigned are left out rather than shown as a row of zeroes.
export function computeWorkload(packages: WorkloadPackage[], members: WorkloadMember[]): WorkloadRow[] {
  return members
    .map((member) => {
      const ownedPackages = packages.filter((p) =>
        member.phase === 'sit' ? p.sitExecutionOwnerId === member.id : p.uatExecutionOwnerId === member.id,
      );
      const steps = ownedPackages.flatMap((p) => p.steps);
      const assignedSteps = steps.length;
      const testedSteps = steps.filter((s) => (member.phase === 'sit' ? s.sitResult : s.uatResult) !== null).length;
      return {
        userId: member.id,
        userName: member.name,
        phase: member.phase,
        assignedSteps,
        testedSteps,
        remainingSteps: assignedSteps - testedSteps,
        testedPercent: percent(testedSteps, assignedSteps),
      };
    })
    .filter((row) => row.assignedSteps > 0);
}

export type DailyTestsPoint = { date: string; [ownerId: string]: string | number };

// How many steps each owner of the given phase tested on each day of the
// period — one series per owner, mirroring lib/testPackageDashboard.ts's
// testedTrend date-axis shape. Keyed by member id rather than name, so two
// owners who happen to share a display name never collide — chart
// components map id -> name for their own series/legend.
export function dailyTestsByOwner(
  packages: WorkloadPackage[],
  members: WorkloadMember[],
  phase: 'sit' | 'uat',
  startDate: string,
  endDate: string,
): DailyTestsPoint[] {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const phaseMembers = members.filter((m) => m.phase === phase);
  return days.map((day) => {
    const point: DailyTestsPoint = { date: day };
    for (const member of phaseMembers) {
      const ownedPackages = packages.filter((p) =>
        phase === 'sit' ? p.sitExecutionOwnerId === member.id : p.uatExecutionOwnerId === member.id,
      );
      const steps = ownedPackages.flatMap((p) => p.steps);
      point[member.id] = steps.filter((s) => {
        const updatedAt = phase === 'sit' ? s.sitResultUpdatedAt : s.uatResultUpdatedAt;
        return Boolean(updatedAt) && updatedAt!.slice(0, 10) === day;
      }).length;
    }
    return point;
  });
}
