'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Org } from '@/lib/types';

const COLORS: Record<Org, string> = { bank: '#159E52', prometeia: '#000D4C' };
const LABELS: Record<Org, string> = { bank: 'Bank', prometeia: 'Prometeia' };

export function OrgVolumeChart({ data }: { data: { org: Org; count: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: LABELS[d.org] }));
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues raised: bank vs. Prometeia</h3>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={90}
            tick={{ fontSize: 12, fill: '#12213F' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, fill: '#12213F' }}>
            {rows.map((row) => (
              <Cell key={row.org} fill={COLORS[row.org]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
