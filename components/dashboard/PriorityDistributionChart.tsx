'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Priority } from '@/lib/types';

const COLORS: Record<Priority, string> = {
  critical: '#B42318',
  high: '#DC5F45',
  medium: '#E8896A',
  low: '#F0B8A8',
};

/**
 * PriorityDistributionChart — Issue Insights dashboard widget (client
 * component).
 *
 * Vertical bar chart of issue counts by priority (critical/high/medium/low),
 * color-coded by severity. Receives the pre-computed distribution from
 * lib/kpi.ts's `priorityDistribution()`; this component only reshapes the
 * `Record<Priority, number>` into an array Recharts can consume and picks
 * each bar's color/label.
 */
export function PriorityDistributionChart({ distribution }: { distribution: Record<Priority, number> }) {
  const data = (Object.keys(distribution) as Priority[]).map((priority) => ({
    priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
    count: distribution[priority],
  }));

  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Issues by priority</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          {/* Pad the axis top by 20% (Math.ceil(dataMax * 1.2)) so the
              value label above the tallest bar doesn't collide with the
              chart's edge; `|| 1` avoids a zero-height domain when every
              count is 0. */}
          <YAxis
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2) || 1]}
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12, fill: '#12213F' }}>
            {data.map((entry) => (
              <Cell key={entry.priority} fill={COLORS[entry.priority]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
