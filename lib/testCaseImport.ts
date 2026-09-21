import type { TestResult } from './types';

/**
 * Parses an uploaded UAT/SIT test-script spreadsheet — already converted to
 * an array of row objects (e.g. via `XLSX.utils.sheet_to_json`) — into
 * structured `ParsedTestStep` records ready to be inserted as
 * `test_package_steps` rows. The only caller is
 * app/actions/testPackages.ts's `uploadTestPackage`, which does the actual
 * file parsing (XLSX -> rows) and the DB insert; this module is the pure,
 * synchronous, easily-testable middle step and has no I/O of its own.
 *
 * Header matching is case- and whitespace-insensitive (`normalizeHeader`),
 * so the sheet's exact header casing/spacing doesn't matter, but the header
 * *text* itself must still match one of REQUIRED_HEADERS.
 *
 * Gotcha: the optional "Result" column here is a pre-existing outcome
 * baked into the uploaded sheet (e.g. results from an earlier round). Since
 * migration 0022 split test results into independent `sit_result`/
 * `uat_result` columns, the caller maps this parsed `result` onto
 * `uat_result` only — an uploaded sheet's baked-in result is treated as a
 * UAT baseline, never a SIT one, because UAT is this app's always-present
 * phase. Do not assume `result` here corresponds to a generic/shared result
 * column in the database; there isn't one anymore.
 */
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
      const parsedStepNumber =
        typeof rawStepNumber === 'number'
          ? rawStepNumber
          : typeof rawStepNumber === 'string' && rawStepNumber.trim() !== ''
            ? Number(rawStepNumber)
            : NaN;
      // A missing/non-numeric "Step" cell falls back to the row's 1-based
      // position in the sheet rather than failing the whole import — the
      // step number is a display/ordering aid, not a unique key the DB
      // depends on, so a best-effort default is preferable to rejecting an
      // otherwise-valid upload over one bad cell.
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

  if (steps.length === 0) {
    return { ok: false, error: 'The sheet has no rows with a step name.' };
  }

  return { ok: true, steps };
}
