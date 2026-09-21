'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeToCloseRow } from '@/lib/kpi';

/**
 * TimeToCloseChart — Issue Insights dashboard widget (client component).
 *
 * Bar chart comparing each priority's actual average time-to-close against
 * its configured SLA target (`engagement.sla_days`), highlighting in red any
 * priority whose average breached its target. All duration/breach math is
 * done upstream by lib/kpi.ts's `timeToCloseByPriority()`; this component
 * only reshapes rows for Recharts (rounding `avgDays` to one decimal,
 * defaulting a null average to 0 for the bar's height) and picks each bar's
 * color.
 */
export function TimeToCloseChart({ rows }: { rows: TimeToCloseRow[] }) {
  const data = rows.map((r) => ({
    label: r.priority.charAt(0).toUpperCase() + r.priority.slice(1),
    // A priority with zero closed issues (avgDays === null) renders as a
    // 0-height, non-breached (green) bar rather than being omitted — the
    // closed-count caption below the chart is the only on-screen way to
    // tell "0 days average" apart from "nothing closed yet".
    actual: r.avgDays !== null ? Number(r.avgDays.toFixed(1)) : 0,
    target: r.targetDays,
    breached: r.avgDays !== null && r.avgDays > r.targetDays,
    count: r.count,
  }));

  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-1 text-sm font-bold text-ink">Time to close vs. SLA target</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Average days to close, by priority. Red means the average missed the SLA target.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2) || 1]}
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#565F78' }}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="target" name="SLA target" fill="#C3C2B7" radius={[4, 4, 0, 0]} />
          <Bar
            dataKey="actual"
            name="Actual average"
            radius={[4, 4, 0, 0]}
            label={{ position: 'top', fontSize: 12, fill: '#12213F' }}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.breached ? '#FF0D21' : '#00DC78'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-ink-soft">{data.map((d) => `${d.label}: ${d.count} closed`).join(' · ')}</p>
    </div>
  );
}
