'use client';

import { useState } from 'react';
import { exportElementToPdf } from '@/lib/exportPdf';

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
        className="rounded border border-ink-soft/30 px-3 py-1.5 text-sm font-medium text-ink hover:bg-white disabled:opacity-60"
      >
        {loading ? 'Generating…' : 'Download as PDF'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
