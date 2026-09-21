'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyTestsPoint } from '@/lib/testWorkload';

// Cycled in a fixed order across owners — the number of execution owners is
// dynamic, unlike the small fixed result-status palettes used elsewhere.
const COLORS = ['#0026FF', '#00DC78', '#FF7D00', '#B42318', '#7C3AED', '#0891B2', '#CA8A04', '#DB2777'];

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

export function DailyTestsByOwnerChart({
  label,
  points,
  owners,
}: {
  label: string;
  points: DailyTestsPoint[];
  owners: { id: string; name: string }[];
}) {
  if (owners.length === 0) return null;
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Tests per day — {label}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
            angle={-45}
            textAnchor="end"
            height={50}
            interval="preserveStartEnd"
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(v) => formatDate(String(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {owners.map((owner, i) => (
            <Line
              key={owner.id}
              type="monotone"
              dataKey={owner.id}
              name={owner.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
