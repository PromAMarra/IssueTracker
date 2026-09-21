'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TestedTrendPoint } from '@/lib/testPackageDashboard';

/**
 * TestedTrendChart — Testing Insights dashboard widget (client component).
 *
 * Line chart comparing the cumulative number of test-package steps actually
 * tested ("Tested") against a straight-line "Target pace" (an even, linear
 * pace from 0 to 100% of steps across the configured SIT or UAT period), for
 * one phase at a time (`label` is "SIT" or "UAT"). Both series are
 * precomputed by lib/testPackageDashboard.ts's `testedTrend()`; this
 * component only renders them.
 *
 * `cumulativeTested` uses `connectNulls={false}` because `testedTrend()`
 * returns `null` for any day beyond "today" — there's no data yet for days
 * that haven't happened — so leaving those gaps unconnected keeps "Tested"
 * from misleadingly flat-lining or extrapolating into the future, unlike
 * "Target pace", which is a projection and is drawn across the whole period.
 */
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

export function TestedTrendChart({
  label,
  period,
  points,
}: {
  label: string;
  period: { start: string; end: string };
  points: TestedTrendPoint[];
}) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">
        Tested vs. target pace — {label} ({formatDate(period.start)}–{formatDate(period.end)})
      </h3>
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
          <Line
            type="monotone"
            dataKey="cumulativeTested"
            name="Tested"
            stroke="#0026FF"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="targetCumulative"
            name="Target pace"
            stroke="#565F78"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
