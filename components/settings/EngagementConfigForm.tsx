'use client';

import { useState, type FormEvent } from 'react';
import type { SlaDays } from '@/lib/types';

export type EngagementConfigValues = {
  name: string;
  bankName: string;
  modules: string[];
  teamMembers: string[];
  slaDays: SlaDays;
};

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function EngagementConfigForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: EngagementConfigValues;
  submitLabel: string;
  onSubmit: (values: EngagementConfigValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [bankName, setBankName] = useState(initial.bankName);
  const [modules, setModules] = useState(initial.modules.join(', '));
  const [teamMembers, setTeamMembers] = useState(initial.teamMembers.join(', '));
  const [sla, setSla] = useState(initial.slaDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name,
        bankName,
        modules: splitList(modules),
        teamMembers: splitList(teamMembers),
        slaDays: sla,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Engagement name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Bank name
        <input
          required
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Modules (comma-separated)
        <input
          value={modules}
          onChange={(e) => setModules(e.target.value)}
          placeholder="Payments, Onboarding, Reporting"
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Prometeia team members / assignees (comma-separated)
        <input
          value={teamMembers}
          onChange={(e) => setTeamMembers(e.target.value)}
          placeholder="Ana Rossi, Marco Bianchi"
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">SLA target (days to close)</legend>
        <div className="grid grid-cols-4 gap-3">
          {PRIORITIES.map((p) => (
            <label key={p} className="flex flex-col gap-1 text-xs capitalize text-ink-soft">
              {p}
              <input
                type="number"
                min={1}
                required
                value={sla[p]}
                onChange={(e) => setSla({ ...sla, [p]: Number(e.target.value) })}
                className="rounded border border-ink-soft/30 px-2 py-1"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded bg-brand-navy px-4 py-2 font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
