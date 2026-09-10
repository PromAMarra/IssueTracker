import type { TimeInStatusRow } from '@/lib/kpi';
import { PRIORITIES, STATUSES } from '@/lib/types';

const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

export function TimeInStatusTable({ rows }: { rows: TimeInStatusRow[] }) {
  const byKey = new Map(rows.map((r) => [`${r.priority}:${r.status}`, r]));

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-ink">Average time in status, by priority</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Days spent in each status, summed across every visit if a ticket was reopened. Only tickets that actually
        passed through a status count toward its average.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-soft/10 text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-2 py-1">Priority</th>
              {STATUSES.map((s) => (
                <th key={s} className="px-2 py-1">
                  {STATUS_LABELS[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((priority) => (
              <tr key={priority} className="border-b border-ink-soft/5 last:border-0">
                <td className="px-2 py-1 capitalize text-ink">{priority}</td>
                {STATUSES.map((status) => {
                  const row = byKey.get(`${priority}:${status}`);
                  return (
                    <td key={status} className="px-2 py-1 font-mono text-ink-soft">
                      {row && row.avgDays !== null ? (
                        <>
                          {row.avgDays.toFixed(1)}d
                          <span className="ml-1 text-xs text-ink-soft/70">({row.count})</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
