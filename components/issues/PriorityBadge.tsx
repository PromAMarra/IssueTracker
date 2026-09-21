import type { Priority } from '@/lib/types';

/**
 * Read-only pill showing an issue's priority as a colored dot + label.
 * Purely presentational — used wherever a priority needs to be displayed
 * without letting the viewer change it (e.g. Bank/SIT views of Board/
 * IssueTable/IssueDetailModal, where priority editing is a Prometeia-only
 * capability enforced server-side, not by this component).
 * `DOT_COLOR`/`LABELS` must stay in sync with the `Priority` union in
 * `lib/types` — TypeScript's `Record<Priority, string>` will fail to compile
 * if a priority value is added/removed without updating these maps.
 */
const DOT_COLOR: Record<Priority, string> = {
  critical: '#B42318',
  high: '#DC5F45',
  medium: '#E8896A',
  low: '#F0B8A8',
};

const LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT_COLOR[priority] }} />
      {LABELS[priority]}
    </span>
  );
}
