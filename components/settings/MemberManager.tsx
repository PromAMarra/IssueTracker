'use client';

import { useState, type FormEvent } from 'react';
import { addMemberByEmail, type Member } from '@/app/actions/engagements';

export function MemberManager({
  engagementId,
  initialMembers,
}: {
  engagementId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await addMemberByEmail(engagementId, email.trim());
    setPending(false);
    setMessage(result.message);
    if (result.ok) {
      setMembers((prev) => [...prev, { userId: '', email: email.trim(), fullName: null }]);
      setEmail('');
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-2 text-sm font-semibold text-ink">Bank members</h2>
      <ul className="mb-3 flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.email} className="text-sm text-ink-soft">
            {m.fullName ?? m.email}
            {m.fullName && <span className="text-xs"> ({m.email})</span>}
          </li>
        ))}
        {members.length === 0 && <li className="text-sm text-ink-soft">No bank members yet.</li>}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="email"
          required
          placeholder="person@bank.com"
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
