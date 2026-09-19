import { TEST_RESULT_LABELS, type TestResult } from '@/lib/types';

const STYLES: Record<'untested' | TestResult, string> = {
  untested: 'bg-slate-100 text-slate-700',
  passed: 'bg-green-100 text-green-800',
  passed_with_minor: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  na: 'bg-slate-100 text-slate-700',
};

export function ResultBadge({ result }: { result: TestResult | null }) {
  const label = result ? TEST_RESULT_LABELS[result] : 'Not tested';
  const styleKey = result ?? 'untested';
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[styleKey]}`}
    >
      {label}
    </span>
  );
}
