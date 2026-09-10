'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dailyDefects } from '@/lib/kpi';
import type { Issue } from '@/lib/types';

export type DateRange = { start: string; end: string };

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

export function DailyDefectsChart({
  issues,
  sitPeriod,
  uatPeriod,
}: {
  issues: Issue[];
  sitPeriod: DateRange | null;
  uatPeriod: DateRange | null;
}) {
  const [selected, setSelected] = useState<'sit' | 'uat'>(sitPeriod ? 'sit' : 'uat');
  const period = (selected === 'sit' ? sitPeriod : uatPeriod) ?? sitPeriod ?? uatPeriod;

  const data = useMemo(() => {
    if (!period) return [];
    return dailyDefects(issues, period.start, period.end).map((b) => ({ ...b, openedNeg: -b.opened }));
  }, [issues, period]);

  if (!sitPeriod && !uatPeriod) {
    return (
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-ink">Daily defects</h3>
        <p className="text-sm text-ink-soft">
          Configure SIT and/or UAT testing period dates in Settings to see this report.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          Daily defects{period ? ` (${formatDate(period.start)}–${formatDate(period.end)})` : ''}
        </h3>
        {sitPeriod && uatPeriod && (
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setSelected('sit')}
              className={`rounded px-2 py-1 font-medium ${
                selected === 'sit' ? 'bg-brand-navy text-white' : 'text-ink-soft hover:bg-surface'
              }`}
            >
              SIT
            </button>
            <button
              type="button"
              onClick={() => setSelected('uat')}
              className={`rounded px-2 py-1 font-medium ${
                selected === 'uat' ? 'bg-brand-navy text-white' : 'text-ink-soft hover:bg-surface'
              }`}
            >
              UAT
            </button>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fill: '#565F78' }}
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
          <Bar dataKey="openedNeg" name="Defects new" fill="#DC2626" radius={[0, 0, 4, 4]} />
          <Bar dataKey="closed" name="Defects closed" fill="#159E52" radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="liveDefects"
            name="Current live defects"
            stroke="#D97706"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
