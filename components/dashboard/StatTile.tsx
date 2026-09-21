/**
 * StatTile — generic KPI tile used across both Issue Insights and Testing
 * Insights dashboard views (e.g. "Total issues", "Open", "Reopen rate",
 * "% tested"). Purely presentational: it does no formatting of `value`
 * itself, so callers are responsible for turning a number into the exact
 * display string (rounding, adding a "%" suffix, etc.) before passing it in.
 */
export function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-ink">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-ink-soft">{sublabel}</p>}
    </div>
  );
}
