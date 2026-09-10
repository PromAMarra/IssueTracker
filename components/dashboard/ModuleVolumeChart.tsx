'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ModuleVolumeChart({ data }: { data: { module: string; count: number }[] }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues by module</h3>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
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
            dataKey="module"
            width={110}
            tick={{ fontSize: 12, fill: '#12213F' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" fill="#0026FF" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, fill: '#12213F' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
