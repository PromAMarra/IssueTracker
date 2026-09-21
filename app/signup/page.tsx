'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { retryAsync } from '@/lib/retryAsync';

/**
 * `/signup` — self-service account creation via Supabase Auth
 * (`supabase.auth.signUp`), called directly from the browser with the anon
 * key (see lib/supabase/client.ts). This only creates a `profiles`-linked
 * auth user; it does NOT grant access to any engagement. A brand-new
 * account has zero engagement memberships until a Prometeia admin adds
 * their email to one via Settings → member management — see the
 * post-signup messaging below, and `app/(app)/page.tsx`'s "no engagement
 * yet" fallback, which is exactly what a user in this state lands on after
 * confirming their email and signing in.
 */
export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      const { error: signUpError } = await retryAsync(() =>
        supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        }),
      );
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-lg border border-hairline bg-white p-8 text-center">
          <h1 className="mb-2 text-xl font-semibold text-ink">Check your email</h1>
          <p className="text-sm text-ink-soft">
            Confirm your address, then{' '}
            <Link href="/login" className="text-brand-blue hover:underline">
              sign in
            </Link>
            . If you were expecting access to a specific bank engagement, let your Prometeia
            contact know your email so they can add you.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-white p-8">
        <h1 className="mb-1 text-xl font-semibold text-ink">Create an account</h1>
        <p className="mb-6 text-sm text-ink-soft">Prometeia Issue Tracker</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm text-ink">
            <label htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-md border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm text-ink">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm text-ink">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-brand-blue px-4 py-2 font-bold text-white hover:bg-primary-active disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink-soft">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-blue hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
