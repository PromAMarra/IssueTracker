import type { AgingRow } from '@/lib/kpi';

export function AgingReportTable({ rows }: { rows: AgingRow[] }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Aging — open issues, oldest first</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No open issues.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-soft/10 text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-2 py-1">Key</th>
                <th className="px-2 py-1">Title</th>
                <th className="px-2 py-1">Priority</th>
                <th className="px-2 py-1">Days open</th>
                <th className="px-2 py-1">SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.issue.id} className="border-b border-ink-soft/5 last:border-0">
                  <td className="px-2 py-1 font-mono text-xs text-ink-soft">{row.issue.key}</td>
                  <td className="px-2 py-1 text-ink">{row.issue.title}</td>
                  <td className="px-2 py-1 capitalize text-ink-soft">{row.issue.priority}</td>
                  <td className="px-2 py-1 font-mono text-ink">{row.daysOpen.toFixed(1)}</td>
                  <td className="px-2 py-1">
                    {row.breached ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Over ({row.targetDays}d target)
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Within SLA
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
