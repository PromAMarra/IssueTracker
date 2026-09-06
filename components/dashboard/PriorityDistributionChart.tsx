'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Priority } from '@/lib/types';

const COLORS: Record<Priority, string> = {
  critical: '#B42318',
  high: '#DC5F45',
  medium: '#E8896A',
  low: '#F0B8A8',
};

export function PriorityDistributionChart({ distribution }: { distribution: Record<Priority, number> }) {
  const data = (Object.keys(distribution) as Priority[]).map((priority) => ({
    priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
    count: distribution[priority],
  }));

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues by priority</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
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
