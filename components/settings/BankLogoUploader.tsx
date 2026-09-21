'use client';

import { useState, type ChangeEvent } from 'react';
import { uploadBankLogo } from '@/app/actions/engagements';

/**
 * File-picker control on the Settings page for uploading a bank's logo,
 * shown next to the Prometeia logo in `Header` once set (see
 * `current.bank_logo_url`). Scoped to one `engagementId` — each engagement
 * has its own bank logo, unlike `PrometeiaLogoUploader` which is global.
 *
 * Gotcha: `preview` is set from `URL.createObjectURL(file)` (a local blob
 * URL, not the uploaded file's real Storage URL) purely so the new logo
 * shows immediately without waiting on a server round-trip/refresh. This
 * object URL is never revoked and only lives for this component's lifetime;
 * a real remote URL is picked up on the next full page load. Access control
 * for who may upload is enforced server-side by `uploadBankLogo`/RLS on
 * Supabase Storage, not by this component.
 */
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
      <label className="cursor-pointer rounded border border-ink-soft/30 px-3 py-2 text-sm text-ink hover:bg-primary-soft">
        {uploading ? 'Uploading…' : 'Upload bank logo'}
        <input type="file" accept="image/*" onChange={handleChange} className="hidden" disabled={uploading} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
