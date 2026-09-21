'use client';

import { useState, type FormEvent } from 'react';
import { addMemberByEmail, type Member, type MemberRole } from '@/app/actions/engagements';

/**
 * Per-role team roster editor on the Settings page — one instance rendered
 * per `MemberRole` ('bank' | 'sit' | 'prometeia'), each scoped to a single
 * `engagementId`. Adding a member here is what actually determines a user's
 * role/org on this engagement (which in turn drives every `isProm`/org-based
 * gate elsewhere in the app, and the RLS policies keyed on membership).
 *
 * Gotcha: whether an engagement is expected to have a SIT phase at all is a
 * separate `sitExpected` setting (see `EngagementConfigForm`) — this
 * component doesn't know or care about that; it will happily render/accept
 * SIT members regardless. The empty-state copy for 'sit' below calls out a
 * related nuance: tickets reported by a SIT member are tagged 'sit', not
 * 'bank', for `Org`-based filtering (see `IssueTable`'s "Raised by" filter).
 */
const COPY: Record<MemberRole, { title: string; empty: string; placeholder: string }> = {
  bank: {
    title: 'Bank members (UAT)',
    empty: 'No bank members yet.',
    placeholder: 'person@bank.com',
  },
  sit: {
    title: 'SIT members',
    empty: 'No SIT members yet — tickets they report will be tagged as SIT, not UAT.',
    placeholder: 'person@example.com',
  },
  prometeia: {
    title: 'Prometeia team',
    empty: 'No Prometeia team members yet — add anyone who should be assignable to tickets.',
    placeholder: 'person@prometeia.com',
  },
};

export function MemberManager({
  engagementId,
  role,
  initialMembers,
}: {
  engagementId: string;
  role: MemberRole;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const copy = COPY[role];

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const result = await addMemberByEmail(engagementId, email.trim(), role);
      setMessage(result.message);
      if (result.ok) {
        // Optimistic append with a placeholder userId: '' — the real user id
        // (and full name, if that person already has a profile) is only
        // known server-side and isn't returned by addMemberByEmail. This
        // list re-syncs to real data on next full page load; until then, a
        // just-added row has no usable userId (see the `key={m.email}` below
        // sidestepping the empty-id collision for list rendering).
        setMembers((prev) => [...prev, { userId: '', email: email.trim(), fullName: null }]);
        setEmail('');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add this member.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-2 text-sm font-bold text-ink">{copy.title}</h2>
      <ul className="mb-3 flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.email} className="text-sm text-ink-soft">
            {m.fullName ?? m.email}
            {m.fullName && <span className="text-xs"> ({m.email})</span>}
          </li>
        ))}
        {members.length === 0 && <li className="text-sm text-ink-soft">{copy.empty}</li>}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="email"
          required
          placeholder={copy.placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-ink-soft/30 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-blue px-3 py-2 text-sm font-bold text-white hover:bg-primary-active disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
