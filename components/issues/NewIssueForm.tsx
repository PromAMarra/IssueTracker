'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createIssue } from '@/app/actions/issues';
import type { Priority } from '@/lib/types';

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export function NewIssueForm({
  engagementId,
  modules,
  onCreated,
}: {
  engagementId: string;
  modules: string[];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [module, setModule] = useState(modules[0] ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createIssue({ engagementId, title, description, priority, module: module || null });
      setTitle('');
      setDescription('');
      router.refresh();
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the issue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm">
      <input
        required
        placeholder="Issue title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded border border-ink-soft/30 px-3 py-2 text-sm"
      />
      <textarea
        required
        placeholder="What's wrong, and how to reproduce it"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="rounded border border-ink-soft/30 px-3 py-2 text-sm"
      />
      <div className="flex gap-3">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded border border-ink-soft/30 px-2 py-2 text-sm capitalize"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="rounded border border-ink-soft/30 px-2 py-2 text-sm"
        >
          <option value="">No module</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
      >
        {submitting ? 'Reporting…' : 'Report issue'}
      </button>
    </form>
  );
}
