import type { Status } from '@/lib/types';

/**
 * Read-only pill showing an issue's lifecycle status (backlog / ongoing /
 * ready_for_test / closed / rejected) with status-specific coloring.
 * Purely presentational — shown instead of an editable `<select>` for
 * whichever side does not currently have edit rights on this field (see
 * `isProm`/`canPostOnIssue` gating in Board, IssueTable, IssueDetailModal;
 * the real transition rules live server-side in RLS/triggers, e.g.
 * `BANK_SIT_ALLOWED_TRANSITIONS` in `lib/issueAccess.ts`).
 * `STYLES`/`LABELS` must stay in sync with the `Status` union in
 * `lib/types` — the `Record<Status, string>` type will fail to compile if a
 * status is added/removed without updating these maps.
 */
const STYLES: Record<Status, string> = {
  backlog: 'bg-slate-100 text-slate-700',
  ongoing: 'bg-amber-100 text-amber-800',
  ready_for_test: 'bg-teal-100 text-teal-800',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
