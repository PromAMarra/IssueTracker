'use client';

import { useState, type ChangeEvent } from 'react';
import { uploadBankLogo } from '@/app/actions/engagements';

export function BankLogoUploader({
  engagementId,
  currentUrl,
}: {
  engagementId: string;
  currentUrl: string | null;
}) {
  const [preview, setPreview] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      await uploadBankLogo(engagementId, formData);
      setPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Bank logo" className="h-12 max-w-[160px] object-contain" />
      )}
      <label className="cursor-pointer rounded border border-ink-soft/30 px-3 py-2 text-sm text-ink hover:bg-white">
        {uploading ? 'Uploading…' : 'Upload bank logo'}
        <input type="file" accept="image/*" onChange={handleChange} className="hidden" disabled={uploading} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
