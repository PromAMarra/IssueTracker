import { describe, expect, it } from 'vitest';
import { computeWorkload, dailyTestsByOwner, type WorkloadMember, type WorkloadPackage } from './testWorkload';

const SIT_MEMBER: WorkloadMember = { id: 'sit-1', name: 'Sara SIT', phase: 'sit' };
const UAT_MEMBER: WorkloadMember = { id: 'uat-1', name: 'Umar UAT', phase: 'uat' };

describe('computeWorkload', () => {
  it('counts assigned/tested/remaining per owner from only the packages they own', () => {
    const packages: WorkloadPackage[] = [
      {
        sitExecutionOwnerId: 'sit-1',
        uatExecutionOwnerId: 'uat-1',
        steps: [
          { sitResult: 'passed', uatResult: null },
          { sitResult: null, uatResult: 'failed' },
          { sitResult: 'failed', uatResult: 'passed' },
        ],
      },
      {
        sitExecutionOwnerId: null,
        uatExecutionOwnerId: 'uat-1',
        steps: [{ sitResult: 'passed', uatResult: null }],
      },
    ];

    const rows = computeWorkload(packages, [SIT_MEMBER, UAT_MEMBER]);

    const sitRow = rows.find((r) => r.userId === 'sit-1');
    expect(sitRow).toEqual({
      userId: 'sit-1',
      userName: 'Sara SIT',
      phase: 'sit',
      assignedSteps: 3,
      testedSteps: 2,
      remainingSteps: 1,
      testedPercent: 66.7,
    });

    const uatRow = rows.find((r) => r.userId === 'uat-1');
    expect(uatRow).toEqual({
      userId: 'uat-1',
      userName: 'Umar UAT',
      phase: 'uat',
      assignedSteps: 4,
      testedSteps: 2,
      remainingSteps: 2,
      testedPercent: 50,
    });
  });

  it('omits an owner with nothing assigned rather than showing a row of zeroes', () => {
    const packages: WorkloadPackage[] = [
      { sitExecutionOwnerId: null, uatExecutionOwnerId: null, steps: [{ sitResult: null, uatResult: null }] },
    ];
    const rows = computeWorkload(packages, [SIT_MEMBER, UAT_MEMBER]);
    expect(rows).toEqual([]);
  });

  it('never counts a SIT owner\'s uat_result or a UAT owner\'s sit_result as their own work', () => {
    const packages: WorkloadPackage[] = [
      {
        sitExecutionOwnerId: 'sit-1',
        uatExecutionOwnerId: null,
        steps: [{ sitResult: null, uatResult: 'passed' }],
      },
    ];
    const rows = computeWorkload(packages, [SIT_MEMBER]);
    expect(rows).toEqual([
      { userId: 'sit-1', userName: 'Sara SIT', phase: 'sit', assignedSteps: 1, testedSteps: 0, remainingSteps: 1, testedPercent: 0 },
    ]);
  });
});

describe('dailyTestsByOwner', () => {
  it('counts each owner\'s own-phase tests per day, one series per owner', () => {
    const packages: WorkloadPackage[] = [
      {
        sitExecutionOwnerId: 'sit-1',
        uatExecutionOwnerId: 'uat-1',
        steps: [
          { sitResult: 'passed', sitResultUpdatedAt: '2026-01-01T10:00:00.000Z', uatResult: null, uatResultUpdatedAt: null },
          { sitResult: 'failed', sitResultUpdatedAt: '2026-01-01T14:00:00.000Z', uatResult: 'passed', uatResultUpdatedAt: '2026-01-02T09:00:00.000Z' },
          { sitResult: 'passed', sitResultUpdatedAt: '2026-01-02T08:00:00.000Z', uatResult: null, uatResultUpdatedAt: null },
        ],
      },
    ];
    const points = dailyTestsByOwner(packages, [SIT_MEMBER, UAT_MEMBER], 'sit', '2026-01-01', '2026-01-03');
    expect(points).toEqual([
      { date: '2026-01-01', 'sit-1': 2 },
      { date: '2026-01-02', 'sit-1': 1 },
      { date: '2026-01-03', 'sit-1': 0 },
    ]);
  });

  it('only includes members of the requested phase', () => {
    const packages: WorkloadPackage[] = [
      {
        sitExecutionOwnerId: 'sit-1',
        uatExecutionOwnerId: 'uat-1',
        steps: [{ sitResult: 'passed', sitResultUpdatedAt: '2026-01-01T10:00:00.000Z', uatResult: 'passed', uatResultUpdatedAt: '2026-01-01T10:00:00.000Z' }],
      },
    ];
    const points = dailyTestsByOwner(packages, [SIT_MEMBER, UAT_MEMBER], 'uat', '2026-01-01', '2026-01-01');
    expect(points).toEqual([{ date: '2026-01-01', 'uat-1': 1 }]);
  });

  it('ignores results with no timestamp (pre-filled data) rather than crashing', () => {
    const packages: WorkloadPackage[] = [
      {
        sitExecutionOwnerId: 'sit-1',
        uatExecutionOwnerId: null,
        steps: [{ sitResult: 'passed', sitResultUpdatedAt: null, uatResult: null, uatResultUpdatedAt: null }],
      },
    ];
    const points = dailyTestsByOwner(packages, [SIT_MEMBER], 'sit', '2026-01-01', '2026-01-01');
    expect(points).toEqual([{ date: '2026-01-01', 'sit-1': 0 }]);
  });
});
