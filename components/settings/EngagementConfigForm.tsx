'use client';

import { useState, type FormEvent } from 'react';
import type { SlaDays } from '@/lib/types';

export type EngagementConfigValues = {
  name: string;
  bankName: string;
  keyPrefix: string;
  modules: string[];
  testCasePackages: string[];
  slaDays: SlaDays;
  sitStartDate: string | null;
  sitEndDate: string | null;
  uatStartDate: string | null;
  uatEndDate: string | null;
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
  const [keyPrefix, setKeyPrefix] = useState(initial.keyPrefix);
  const [modules, setModules] = useState(initial.modules.join(', '));
  const [testCasePackages, setTestCasePackages] = useState(initial.testCasePackages.join(', '));
  const [sla, setSla] = useState(initial.slaDays);
  const [sitStartDate, setSitStartDate] = useState(initial.sitStartDate ?? '');
  const [sitEndDate, setSitEndDate] = useState(initial.sitEndDate ?? '');
  const [uatStartDate, setUatStartDate] = useState(initial.uatStartDate ?? '');
  const [uatEndDate, setUatEndDate] = useState(initial.uatEndDate ?? '');
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
        keyPrefix,
        modules: splitList(modules),
        testCasePackages: splitList(testCasePackages),
        slaDays: sla,
        sitStartDate: sitStartDate || null,
        sitEndDate: sitEndDate || null,
        uatStartDate: uatStartDate || null,
        uatEndDate: uatEndDate || null,
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
        Ticket ID prefix
        <input
          value={keyPrefix}
          onChange={(e) => setKeyPrefix(e.target.value)}
          placeholder="e.g. ESUP (leave blank to auto-generate from the bank name)"
          className="rounded border border-ink-soft/30 px-3 py-2 font-mono uppercase"
        />
        <span className="text-xs font-normal normal-case text-ink-soft">
          Only affects new tickets — existing ones keep their current IDs.
        </span>
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
        Test case packages (comma-separated)
        <input
          value={testCasePackages}
          onChange={(e) => setTestCasePackages(e.target.value)}
          placeholder="Onboarding Suite, Payments Suite, Regression Pack"
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">Testing periods</legend>
        <span className="text-xs text-ink-soft">
          Used by the dashboard's daily defects report. Leave blank for a period that doesn't apply.
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            SIT start
            <input
              type="date"
              value={sitStartDate}
              onChange={(e) => setSitStartDate(e.target.value)}
              className="rounded border border-ink-soft/30 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            SIT end
            <input
              type="date"
              value={sitEndDate}
              onChange={(e) => setSitEndDate(e.target.value)}
              className="rounded border border-ink-soft/30 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            UAT start
            <input
              type="date"
              value={uatStartDate}
              onChange={(e) => setUatStartDate(e.target.value)}
              className="rounded border border-ink-soft/30 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            UAT end
            <input
              type="date"
              value={uatEndDate}
              onChange={(e) => setUatEndDate(e.target.value)}
              className="rounded border border-ink-soft/30 px-2 py-1"
            />
          </label>
        </div>
      </fieldset>
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
