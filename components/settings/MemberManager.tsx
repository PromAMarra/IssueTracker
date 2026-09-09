'use client';

import { useState, type FormEvent } from 'react';
import { addMemberByEmail, type Member, type MemberRole } from '@/app/actions/engagements';

const COPY: Record<MemberRole, { title: string; empty: string; placeholder: string }> = {
  bank: { title: 'Bank members', empty: 'No bank members yet.', placeholder: 'person@bank.com' },
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
      <h2 className="mb-2 text-sm font-semibold text-ink">{copy.title}</h2>
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
          className="flex-1 rounded border border-ink-soft/30 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
