'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { IconTrash } from '@tabler/icons-react';
import {
  deleteTestPackage,
  setTestPackageExecutionOwner,
  uploadTestPackage,
  type TestPackageSummary,
} from '@/app/actions/testPackages';
import type { PhaseTeamMember } from '@/lib/data/engagements';

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export function TestPackageManager({
  engagementId,
  initialPackages,
  sitExpected,
  bankSitTeam,
}: {
  engagementId: string;
  initialPackages: TestPackageSummary[];
  sitExpected: boolean;
  bankSitTeam: PhaseTeamMember[];
}) {
  const [packages, setPackages] = useState(initialPackages);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingOwnerKey, setSavingOwnerKey] = useState<string | null>(null);

  const sitMembers = bankSitTeam.filter((m) => m.phase === 'sit');
  const uatMembers = bankSitTeam.filter((m) => m.phase === 'uat');

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !name) setName(stripExtension(selected.name));
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const trimmedName = name.trim();
      const { packageId, stepCount } = await uploadTestPackage(engagementId, trimmedName, formData);
      setPackages((prev) => [
        {
          id: packageId,
          name: trimmedName,
          stepCount,
          createdAt: new Date().toISOString(),
          sitExecutionOwnerId: null,
          uatExecutionOwnerId: null,
        },
        ...prev,
      ]);
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload this file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(packageId: string) {
    if (!window.confirm('Delete this test package? This cannot be undone.')) return;
    try {
      await deleteTestPackage(engagementId, packageId);
      setPackages((prev) => prev.filter((p) => p.id !== packageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this package.');
    }
  }

  async function handleOwnerChange(packageId: string, phase: 'sit' | 'uat', ownerId: string) {
    const key = `${packageId}:${phase}`;
    setSavingOwnerKey(key);
    setError(null);
    const value = ownerId || null;
    const field = phase === 'sit' ? 'sitExecutionOwnerId' : 'uatExecutionOwnerId';
    try {
      await setTestPackageExecutionOwner(packageId, phase, value);
      setPackages((prev) => prev.map((p) => (p.id === packageId ? { ...p, [field]: value } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the execution owner.');
    } finally {
      setSavingOwnerKey(null);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-2 text-sm font-bold text-ink">Test packages</h2>
      <ul className="mb-3 flex flex-col gap-2">
        {packages.map((p) => (
          <li key={p.id} className="flex flex-col gap-1.5 rounded-md border border-ink-soft/10 p-2 text-sm text-ink-soft">
            <div className="flex items-center justify-between">
              <span>
                {p.name} <span className="text-xs">({p.stepCount} step{p.stepCount === 1 ? '' : 's'})</span>
              </span>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                aria-label={`Delete ${p.name}`}
                title={`Delete ${p.name}`}
                className="text-ink-soft hover:text-red-600"
              >
                <IconTrash className="h-3.5 w-3.5" stroke={1.5} />
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {sitExpected && (
                <label className="flex items-center gap-1 text-xs">
                  SIT owner
                  <select
                    value={p.sitExecutionOwnerId ?? ''}
                    disabled={savingOwnerKey === `${p.id}:sit`}
                    onChange={(e) => handleOwnerChange(p.id, 'sit', e.target.value)}
                    className="rounded-md border border-ink-soft/30 px-1.5 py-0.5"
                  >
                    <option value="">Unassigned</option>
                    {sitMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1 text-xs">
                UAT owner
                <select
                  value={p.uatExecutionOwnerId ?? ''}
                  disabled={savingOwnerKey === `${p.id}:uat`}
                  onChange={(e) => handleOwnerChange(p.id, 'uat', e.target.value)}
                  className="rounded-md border border-ink-soft/30 px-1.5 py-0.5"
                >
                  <option value="">Unassigned</option>
                  {uatMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        ))}
        {packages.length === 0 && <li className="text-sm text-ink-soft">No test packages uploaded yet.</li>}
      </ul>
      <form onSubmit={handleUpload} className="flex flex-col gap-2">
        <input
          type="text"
          required
          placeholder="Package name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-ink-soft/30 px-3 py-2 text-sm"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          required
          onChange={handleFileChange}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={uploading || !file}
          className="w-fit rounded-md bg-brand-blue px-3 py-2 text-sm font-bold text-white hover:bg-primary-active disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
