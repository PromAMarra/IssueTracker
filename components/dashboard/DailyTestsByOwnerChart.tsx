'use client';

import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyTestsPoint } from '@/lib/testWorkload';

/**
 * DailyTestsByOwnerChart — Testing Insights dashboard widget (client
 * component).
 *
 * One line per execution owner of the given `phase` ("SIT" or "UAT"),
 * showing how many test-package steps that owner recorded a result for on
 * each day of the phase's configured period. Data is precomputed by
 * lib/testWorkload.ts's `dailyTestsByOwner()`; this component only renders
 * it and lets the viewer show/hide individual owners' lines.
 *
 * Owner colors are assigned by the owner's position in the `owners` array
 * (via COLORS, cycled with modulo) rather than stored per-user, so a given
 * owner's color is only stable within one render — if `owners` were ever
 * reordered between renders, the same owner could get a different color.
 * The legend "pill" toggle buttons and the chart's own `<Legend>` both
 * derive their color the same way, so the two always agree with each other.
 *
 * Renders nothing (`return null`) when there are no owners for the phase, so
 * an unused SIT or UAT chart doesn't take up dashboard space.
 */
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
  // Everyone shown by default; toggling a pill hides just that one line —
  // useful once there are enough owners that all their lines together turn
  // into an unreadable tangle.
  const [hiddenOwnerIds, setHiddenOwnerIds] = useState<Set<string>>(new Set());
  const visibleOwners = owners.filter((o) => !hiddenOwnerIds.has(o.id));

  function toggleOwner(id: string) {
    setHiddenOwnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (owners.length === 0) return null;

  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Tests per day — {label}</h3>
        {owners.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {owners.map((owner, i) => {
              const hidden = hiddenOwnerIds.has(owner.id);
              const color = COLORS[i % COLORS.length];
              return (
                <button
                  key={owner.id}
                  type="button"
                  onClick={() => toggleOwner(owner.id)}
                  aria-pressed={!hidden}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-opacity ${
                    hidden ? 'border-ink-soft/30 text-ink-soft opacity-50' : 'text-white'
                  }`}
                  style={hidden ? undefined : { backgroundColor: color, borderColor: color }}
                >
                  {owner.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
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
          {visibleOwners.map((owner) => {
            // Look up the owner's index in the full `owners` array, not
            // `visibleOwners` — hiding another owner would otherwise shift
            // this owner's position in the filtered list and change its
            // color mid-session.
            const colorIndex = owners.findIndex((o) => o.id === owner.id);
            return (
              <Line
                key={owner.id}
                type="monotone"
                dataKey={owner.id}
                name={owner.name}
                stroke={COLORS[colorIndex % COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
