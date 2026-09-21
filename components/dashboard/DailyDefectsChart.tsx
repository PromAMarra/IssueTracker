'use client';

import { useMemo } from 'react';
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

/**
 * DailyDefectsChart — Issue Insights dashboard widget (client component).
 *
 * Composed bar+line chart: bars show issues opened ("Defects new", plotted as
 * a negative value so it visually diverges below the axis) and closed
 * ("Defects closed") per calendar day, with a line overlaying the number of
 * defects still open as of that day ("Current live defects"). All bucketing
 * and aggregation is done upstream by lib/kpi.ts's `dailyDefects()`; this
 * component only negates `opened` for the diverging-bar effect and renders
 * the chart.
 *
 * Which date range is plotted:
 * - An engagement can have a configured SIT period, a UAT period, both, or
 *   neither (set in Settings). `forcedPhase` mirrors the page-level SIT/UAT
 *   toggle on the dashboard (see app/(app)/[engagementId]/dashboard/page.tsx)
 *   — this chart has no filter control of its own.
 * - If neither period is configured, the chart renders a placeholder asking
 *   the user to set one up in Settings, since there's no meaningful date
 *   axis without it.
 *
 * Gotcha: `issues` passed in should already be phase-filtered by the caller
 * when a phase is forced — this component doesn't filter by org itself, it
 * only decides which date window (sitPeriod vs. uatPeriod) to plot.
 */
export type DateRange = { start: string; end: string };

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

export function DailyDefectsChart({
  issues,
  sitPeriod,
  uatPeriod,
  forcedPhase,
}: {
  issues: Issue[];
  sitPeriod: DateRange | null;
  uatPeriod: DateRange | null;
  // The page-level SIT/UAT filter (see the dashboard page) is the only
  // control for which period this chart shows — no toggle of its own.
  forcedPhase?: 'sit' | 'uat' | null;
}) {
  // An explicit forcedPhase (from the page-level SIT/UAT toggle) picks the
  // matching period; with no phase forced ("All"), fall back to whichever
  // single period is actually configured. If an engagement has both periods
  // configured, "All" arbitrarily prefers SIT — callers that need a
  // deterministic choice should pass forcedPhase instead of relying on this.
  const period = (forcedPhase === 'sit' ? sitPeriod : forcedPhase === 'uat' ? uatPeriod : null) ?? sitPeriod ?? uatPeriod;

  const data = useMemo(() => {
    if (!period) return [];
    // openedNeg mirrors `opened` onto the negative axis purely for the
    // chart's diverging bar-above/bar-below-zero visual; `opened` itself is
    // left untouched in case a future tooltip/export needs the real count.
    return dailyDefects(issues, period.start, period.end, new Date()).map((b) => ({ ...b, openedNeg: -b.opened }));
  }, [issues, period]);

  if (!sitPeriod && !uatPeriod) {
    return (
      <div className="rounded-lg border border-hairline bg-white p-4">
        <h3 className="mb-1 text-sm font-bold text-ink">Daily defects</h3>
        <p className="text-sm text-ink-soft">
          Configure SIT and/or UAT testing period dates in Settings to see this report.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">
        Daily defects{period ? ` (${formatDate(period.start)}–${formatDate(period.end)})` : ''}
      </h3>
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
          <Bar dataKey="openedNeg" name="Defects new" fill="#FF0D21" radius={[0, 0, 4, 4]} />
          <Bar dataKey="closed" name="Defects closed" fill="#00DC78" radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="liveDefects"
            name="Current live defects"
            stroke="#FF7D00"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
