import type { TestResult } from './types';

export type ParsedTestStep = {
  stepNumber: number;
  stepName: string;
  stepDescription: string;
  expectedOutcome: string;
  result: TestResult | null;
};

export type ParseTestCaseSheetResult = { ok: true; steps: ParsedTestStep[] } | { ok: false; error: string };

const REQUIRED_HEADERS = ['Step name', 'Step', 'Step description', 'Expected outcome'] as const;
type RequiredHeader = (typeof REQUIRED_HEADERS)[number];
const RESULT_HEADER = 'Result';

const RESULT_ALIASES: Record<string, TestResult> = {
  passed: 'passed',
  'passed with minor': 'passed_with_minor',
  failed: 'failed',
  na: 'na',
  'n/a': 'na',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function findHeaderKey(rowKeys: string[], header: string): string | undefined {
  const target = normalizeHeader(header);
  return rowKeys.find((key) => normalizeHeader(key) === target);
}

function normalizeResult(raw: unknown): TestResult | null {
  if (typeof raw !== 'string') return null;
  return RESULT_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function parseTestCaseSheet(rows: Record<string, unknown>[]): ParseTestCaseSheetResult {
  if (rows.length === 0) {
    return { ok: false, error: 'The sheet has no data rows.' };
  }

  const sampleKeys = Object.keys(rows[0]);
  const headerKeys: Partial<Record<RequiredHeader, string>> = {};
  const missing: string[] = [];
  for (const header of REQUIRED_HEADERS) {
    const key = findHeaderKey(sampleKeys, header);
    if (!key) missing.push(header);
    else headerKeys[header] = key;
  }
  if (missing.length > 0) {
    return { ok: false, error: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.` };
  }
  // Every required header is guaranteed present past the check above.
  const cols = headerKeys as Record<RequiredHeader, string>;
  const resultKey = findHeaderKey(sampleKeys, RESULT_HEADER);

  const steps: ParsedTestStep[] = rows
    .map((row, index) => {
      const rawStepNumber = row[cols['Step']];
      const parsedStepNumber = typeof rawStepNumber === 'number' ? rawStepNumber : Number(rawStepNumber);
      const stepNumber = Number.isInteger(parsedStepNumber) ? parsedStepNumber : index + 1;

      return {
        stepNumber,
        stepName: String(row[cols['Step name']] ?? '').trim(),
        stepDescription: String(row[cols['Step description']] ?? '').trim(),
        expectedOutcome: String(row[cols['Expected outcome']] ?? '').trim(),
        result: resultKey ? normalizeResult(row[resultKey]) : null,
      };
    })
    // A fully blank trailing row (common at the end of an Excel sheet) has no step name.
    .filter((step) => step.stepName !== '');

  return { ok: true, steps };
}
