import { describe, expect, it } from 'vitest';
import { testPackageKpis } from './testPackageKpi';

describe('testPackageKpis', () => {
  it('computes totals and percentages for a mix of results', () => {
    const kpis = testPackageKpis([
      { result: 'passed' },
      { result: 'passed_with_minor' },
      { result: 'failed' },
      { result: 'na' },
      { result: null },
      { result: null },
    ]);
    expect(kpis.total).toBe(6);
    expect(kpis.testedCount).toBe(4);
    expect(kpis.testedPercent).toBe(66.7);
    expect(kpis.failedCount).toBe(1);
    expect(kpis.failedPercent).toBe(16.7);
    expect(kpis.toBeTestedCount).toBe(2);
    expect(kpis.toBeTestedPercent).toBe(33.3);
  });

  it('reports 0% tested and 100% to be tested when nothing has been tested', () => {
    const kpis = testPackageKpis([{ result: null }, { result: null }]);
    expect(kpis.testedPercent).toBe(0);
    expect(kpis.toBeTestedPercent).toBe(100);
  });

  it('reports 100% tested and 0% to be tested when everything has a result', () => {
    const kpis = testPackageKpis([{ result: 'passed' }, { result: 'na' }]);
    expect(kpis.testedPercent).toBe(100);
    expect(kpis.toBeTestedPercent).toBe(0);
  });

  it('returns all zeros for an empty step list without dividing by zero', () => {
    const kpis = testPackageKpis([]);
    expect(kpis).toEqual({
      total: 0,
      testedCount: 0,
      testedPercent: 0,
      failedCount: 0,
      failedPercent: 0,
      toBeTestedCount: 0,
      toBeTestedPercent: 0,
    });
  });

  it('rounds percentages to one decimal place', () => {
    const kpis = testPackageKpis([{ result: 'passed' }, { result: null }, { result: null }]);
    expect(kpis.testedPercent).toBe(33.3);
  });
});
