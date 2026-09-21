'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ThroughputBucket } from '@/lib/kpi';

/**
 * ThroughputChart — Issue Insights dashboard widget (client component).
 *
 * Line chart of issues opened vs. closed per week, over the trailing window
 * produced by lib/kpi.ts's `throughputByWeek()`. The window length itself is
 * decided by the caller (the dashboard page currently passes `8` weeks) and
 * is only reflected here indirectly, via `buckets.length` in the heading.
 * Purely presentational otherwise.
 */
export function ThroughputChart({ buckets }: { buckets: ThroughputBucket[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Throughput (last {buckets.length} weeks)</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tick={{ fontSize: 11, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="opened" name="Opened" stroke="#0026FF" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="closed" name="Closed" stroke="#00DC78" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
