import type { Priority } from '@/lib/types';

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
