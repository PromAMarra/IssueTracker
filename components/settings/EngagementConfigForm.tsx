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
  sitExpected: boolean;
  testCasesEnabled: boolean;
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
  const [sitExpected, setSitExpected] = useState(initial.sitExpected);
  const [testCasesEnabled, setTestCasesEnabled] = useState(initial.testCasesEnabled);
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
        sitExpected,
        testCasesEnabled,
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
        Engagement Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Bank Name
        <input
          required
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="rounded-md border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Ticket ID Prefix
        <input
          value={keyPrefix}
          onChange={(e) => setKeyPrefix(e.target.value)}
          placeholder="e.g. ESUP (leave blank to auto-generate from the bank name)"
          className="rounded-md border border-ink-soft/30 px-3 py-2 font-mono uppercase"
        />
        <span className="text-xs font-normal normal-case text-ink-soft">
          Only affects new tickets — existing ones keep their current IDs.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Modules (Comma-Separated)
        <input
          value={modules}
          onChange={(e) => setModules(e.target.value)}
          placeholder="Payments, Onboarding, Reporting"
          className="rounded-md border border-ink-soft/30 px-3 py-2"
        />
      </label>
      {!testCasesEnabled && (
        <label className="flex flex-col gap-1 text-sm text-ink">
          Test Case Packages (Comma-Separated)
          <input
            value={testCasePackages}
            onChange={(e) => setTestCasePackages(e.target.value)}
            placeholder="Onboarding Suite, Payments Suite, Regression Pack"
            className="rounded-md border border-ink-soft/30 px-3 py-2"
          />
        </label>
      )}
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={sitExpected}
          onChange={(e) => setSitExpected(e.target.checked)}
          className="mt-1"
        />
        <span className="flex flex-col gap-1">
          This Engagement Has A SIT Phase
          <span className="text-xs text-ink-soft">
            Unchecking this removes SIT from settings, the dashboard, and filters for this engagement.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={testCasesEnabled}
          onChange={(e) => setTestCasesEnabled(e.target.checked)}
          className="mt-1"
        />
        <span className="flex flex-col gap-1">
          Track Test Cases From Uploaded Files
          <span className="text-xs text-ink-soft">
            When on, Prometeia can upload test case files and the "Test Case Package" field on
            tickets is populated from them instead of the list above.
          </span>
        </span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">Testing Periods</legend>
        <span className="text-xs text-ink-soft">
          Used by the dashboard's daily defects report. Leave blank for a period that doesn't apply.
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sitExpected && (
            <>
              <label className="flex flex-col gap-1 text-xs text-ink-soft">
                SIT Start
                <input
                  type="date"
                  value={sitStartDate}
                  onChange={(e) => setSitStartDate(e.target.value)}
                  className="rounded-md border border-ink-soft/30 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-soft">
                SIT End
                <input
                  type="date"
                  value={sitEndDate}
                  onChange={(e) => setSitEndDate(e.target.value)}
                  className="rounded-md border border-ink-soft/30 px-2 py-1"
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            UAT Start
            <input
              type="date"
              value={uatStartDate}
              onChange={(e) => setUatStartDate(e.target.value)}
              className="rounded-md border border-ink-soft/30 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            UAT End
            <input
              type="date"
              value={uatEndDate}
              onChange={(e) => setUatEndDate(e.target.value)}
              className="rounded-md border border-ink-soft/30 px-2 py-1"
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">SLA Target (Days To Close)</legend>
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
                className="rounded-md border border-ink-soft/30 px-2 py-1"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded-md bg-brand-blue px-4 py-2 font-bold text-white hover:bg-primary-active disabled:opacity-60"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
