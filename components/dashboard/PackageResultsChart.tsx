'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PackageResultBreakdown } from '@/lib/testPackageDashboard';

const RESULT_SERIES = [
  { key: 'passed', name: 'Passed', color: '#00DC78' },
  { key: 'passedWithMinor', name: 'Passed with minor', color: '#FF7D00' },
  { key: 'failed', name: 'Failed', color: '#FF0D21' },
  { key: 'na', name: 'N/A', color: '#94A3B8' },
  { key: 'notTested', name: 'Not tested', color: '#CBD5E1' },
] as const;

const Y_AXIS_WIDTH = 180;
const MAX_LABEL_CHARS = 22;

function totalOf(row: PackageResultBreakdown): number {
  return row.passed + row.passedWithMinor + row.failed + row.na + row.notTested;
}

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

function ResultsTooltip({ active, payload }: { active?: boolean; payload?: { payload: PackageResultBreakdown }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const total = totalOf(row);
  return (
    <div className="rounded-md border border-hairline bg-white p-2 text-xs shadow-md">
      <p className="mb-1 font-bold text-ink">{row.packageName}</p>
      {RESULT_SERIES.map(({ key, name, color }) => {
        const value = row[key];
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
          <p key={key} style={{ color }}>
            {name}: {value} ({pct}%)
          </p>
        );
      })}
      <p className="mt-1 text-ink-soft">Total: {total}</p>
    </div>
  );
}

// Recharts doesn't truncate YAxis category ticks on its own, so long package
// names (e.g. "20250901 - CR 560 Created by attribute") get a custom tick
// that truncates with an ellipsis; the full name is still available via a
// native <title> tooltip and the chart's own Tooltip on hover.
function PackageNameTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = payload?.value ?? '';
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <title>{label}</title>
      <text dx={-8} dy={4} textAnchor="end" fontSize={11} fill="#565F78">
        {truncateLabel(label)}
      </text>
    </g>
  );
}

// Renders the row's raw total just past the end of the (normalized) stack,
// so the underlying counts aren't lost when the bars are shown as percentages.
type LabelPositionProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  index?: number;
};

function makeTotalLabel(data: PackageResultBreakdown[]) {
  return function TotalLabel(props: LabelPositionProps) {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const index = props.index ?? 0;
    const row = data[index];
    if (!row) return null;
    const total = totalOf(row);
    return (
      <text x={x + width + 8} y={y + height / 2} dy={4} fontSize={11} fill="#565F78">
        {total}
      </text>
    );
  };
}

export function PackageResultsChart({ data }: { data: PackageResultBreakdown[] }) {
  const rowHeight = 32;
  const height = Math.max(160, data.length * rowHeight + 56);
  const lastSeries = RESULT_SERIES[RESULT_SERIES.length - 1];
  const totalLabel = makeTotalLabel(data);

  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-ink">Results by package</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          stackOffset="expand"
          margin={{ top: 8, right: 40, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="packageName"
            width={Y_AXIS_WIDTH}
            tick={<PackageNameTick />}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ResultsTooltip />} />
          <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12 }} />
          {RESULT_SERIES.map(({ key, name, color }) => (
            <Bar
              key={key}
              dataKey={key}
              name={name}
              stackId="results"
              fill={color}
              radius={key === lastSeries.key ? [0, 4, 4, 0] : undefined}
            >
              {key === lastSeries.key ? <LabelList dataKey={key} content={totalLabel} /> : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
