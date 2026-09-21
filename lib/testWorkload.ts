import type { TestResult } from './types';

export type WorkloadStep = { sitResult: TestResult | null; uatResult: TestResult | null };

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
