import { describe, expect, it } from 'vitest';
import { computeWorkload, type WorkloadMember, type WorkloadPackage } from './testWorkload';

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
