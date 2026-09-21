'use client';

import { useState } from 'react';
import { exportElementToPdf } from '@/lib/exportPdf';

/**
 * ExportPdfButton — Issue Insights dashboard action (client component).
 *
 * Renders the dashboard's on-screen content (the DOM node identified by
 * `targetId` — the `#dashboard-export-root` wrapper on the dashboard page)
 * into a multi-page PDF via lib/exportPdf.ts's `exportElementToPdf()`
 * (html2canvas -> jsPDF), and triggers a client-side download. This is a
 * visual snapshot of the rendered page, not a data export — for a
 * spreadsheet of the underlying numbers, see ExportDashboardButton.tsx.
 *
 * Local `loading`/`error` state exists purely for UX feedback during the
 * (potentially slow, multi-second) canvas render; it has no bearing on the
 * export's correctness.
 */
export function ExportPdfButton({
  targetId,
  engagementName,
}: {
  targetId: string;
  engagementName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const safeName = engagementName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engagement';
      const title = `${engagementName} — UAT Dashboard`;
      const filename = `${safeName}-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;
      await exportElementToPdf(targetId, title, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the PDF.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="rounded-md border border-ink-soft/30 px-3 py-1.5 text-sm font-medium text-ink hover:bg-primary-soft disabled:opacity-60"
      >
        {loading ? 'Generating…' : 'Download as PDF'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
