import type { AgingRow } from '@/lib/kpi';

/**
 * AgingReportTable — Issue Insights dashboard widget.
 *
 * Renders the 10 oldest still-open issues (backlog / ongoing / ready_for_test)
 * for the current engagement, ordered oldest-first, flagging any whose age
 * exceeds its priority's SLA target day count.
 *
 * Responsibilities:
 * - Pure presentational component: all aging math (days open, SLA breach) is
 *   computed upstream by `agingReport()` in lib/kpi.ts and passed in via the
 *   `rows` prop — this component does no date arithmetic of its own.
 * - Truncates to the first 10 rows for on-screen readability; the full list
 *   is still available to the user via "Export to Excel" (see
 *   ExportDashboardButton.tsx), which is given the untruncated `aging` array.
 *
 * Gotcha: `rows` is expected to already be sorted oldest-first by the caller
 * (lib/kpi.ts's `agingReport()` sorts by `daysOpen` descending) — this
 * component does not re-sort, so passing an unsorted array will silently show
 * the wrong "oldest first" 10 rows.
 */
export function AgingReportTable({ rows }: { rows: AgingRow[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Aging — open issues, oldest first</h3>
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
              {/* Capped at 10 — see the file header for why the rest is only in the Excel export. */}
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
