'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PackageResultBreakdown } from '@/lib/testPackageDashboard';

export function PackageResultsChart({ data }: { data: PackageResultBreakdown[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Results by package</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="packageName"
            tick={{ fontSize: 10, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            height={60}
            interval={0}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="passed" name="Passed" stackId="results" fill="#00DC78" />
          <Bar dataKey="passedWithMinor" name="Passed with minor" stackId="results" fill="#FF7D00" />
          <Bar dataKey="failed" name="Failed" stackId="results" fill="#FF0D21" />
          <Bar dataKey="na" name="N/A" stackId="results" fill="#94A3B8" />
          <Bar dataKey="notTested" name="Not tested" stackId="results" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
