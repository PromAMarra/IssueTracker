import type { WorkloadRow } from '@/lib/testWorkload';

const PHASE_LABELS: Record<'sit' | 'uat', string> = { sit: 'SIT', uat: 'UAT' };

export function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Workload by execution owner</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No execution owners assigned yet — set them in Settings.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-soft/10 text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-2 py-1">Owner</th>
                <th className="px-2 py-1">Phase</th>
                <th className="px-2 py-1">Assigned</th>
                <th className="px-2 py-1">Tested</th>
                <th className="px-2 py-1">Remaining</th>
                <th className="px-2 py-1">% tested</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.userId}:${row.phase}`} className="border-b border-ink-soft/5 last:border-0">
                  <td className="px-2 py-1 text-ink">{row.userName}</td>
                  <td className="px-2 py-1 text-ink-soft">{PHASE_LABELS[row.phase]}</td>
                  <td className="px-2 py-1 font-mono text-ink-soft">{row.assignedSteps}</td>
                  <td className="px-2 py-1 font-mono text-ink-soft">{row.testedSteps}</td>
                  <td className="px-2 py-1 font-mono text-ink-soft">{row.remainingSteps}</td>
                  <td className="px-2 py-1 font-mono text-ink-soft">{row.testedPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
