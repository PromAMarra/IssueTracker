import { describe, expect, it } from 'vitest';
import { parseTestCaseSheet } from './testCaseImport';

const VALID_ROWS = [
  {
    'Step name': '001-CR 560 Created by attribute - Welcome page',
    Step: 1,
    'Step description': 'Do the thing.',
    'Expected outcome': 'The thing happens.',
    Result: null,
  },
  {
    'Step name': '002-CR 560 Created by attribute - Office view',
    Step: 2,
    'Step description': 'Do the other thing.',
    'Expected outcome': 'The other thing happens.',
    Result: null,
  },
];

describe('parseTestCaseSheet', () => {
  it('parses rows with exact headers', () => {
    const result = parseTestCaseSheet(VALID_ROWS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({
      stepNumber: 1,
      stepName: '001-CR 560 Created by attribute - Welcome page',
      stepDescription: 'Do the thing.',
      expectedOutcome: 'The thing happens.',
      result: null,
    });
  });

  it('matches headers by name regardless of column order', () => {
    const reordered = VALID_ROWS.map((row) => ({
      'Expected outcome': row['Expected outcome'],
      Step: row.Step,
      'Step description': row['Step description'],
      'Step name': row['Step name'],
    }));
    const result = parseTestCaseSheet(reordered);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].stepName).toBe('001-CR 560 Created by attribute - Welcome page');
  });

  it('matches headers case-insensitively', () => {
    const upper = VALID_ROWS.map((row) => ({
      'STEP NAME': row['Step name'],
      STEP: row.Step,
      'step description': row['Step description'],
      'Expected Outcome': row['Expected outcome'],
    }));
    const result = parseTestCaseSheet(upper);
    expect(result.ok).toBe(true);
  });

  it('reports a single missing required header by name', () => {
    const rows = VALID_ROWS.map(({ Step, ...rest }) => rest);
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('Step');
  });

  it('reports every missing required header when several are absent', () => {
    const rows = VALID_ROWS.map(({ Step, 'Expected outcome': _eo, ...rest }) => rest);
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('Step');
    expect(result.error).toContain('Expected outcome');
  });

  it('ignores extra unrelated columns', () => {
    const withExtra = VALID_ROWS.map((row) => ({ ...row, 'Some other column': 'noise' }));
    const result = parseTestCaseSheet(withExtra);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(Object.keys(result.steps[0])).not.toContain('Some other column');
  });

  it('normalizes a recognizable pre-filled Result value', () => {
    const rows = [{ ...VALID_ROWS[0], Result: 'Passed with minor' }];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].result).toBe('passed_with_minor');
  });

  it('treats an unrecognized Result value as untested', () => {
    const rows = [{ ...VALID_ROWS[0], Result: 'Not sure yet' }];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].result).toBeNull();
  });

  it('falls back to row order when Step is non-numeric', () => {
    const rows = [
      { ...VALID_ROWS[0], Step: 'n/a' },
      { ...VALID_ROWS[1], Step: 'n/a' },
    ];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps[0].stepNumber).toBe(1);
    expect(result.steps[1].stepNumber).toBe(2);
  });

  it('filters out a fully blank trailing row', () => {
    const rows = [...VALID_ROWS, { 'Step name': '', Step: '', 'Step description': '', 'Expected outcome': '' }];
    const result = parseTestCaseSheet(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps).toHaveLength(2);
  });

  it('fails on zero data rows', () => {
    const result = parseTestCaseSheet([]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('no data rows');
  });
});
