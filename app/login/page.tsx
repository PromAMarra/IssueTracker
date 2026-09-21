'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { retryAsync } from '@/lib/retryAsync';

/**
 * `/login` — the only public, unauthenticated entry point for existing
 * users (paired with `/signup` for new ones). This is a client component
 * that talks to Supabase Auth directly from the browser via
 * `lib/supabase/client.ts`'s anon-key client, not through a Server Action —
 * `supabase.auth.signInWithPassword` sets the session cookie itself.
 *
 * Critical gotcha: after a successful sign-in this does a hard
 * `window.location.href = '/'` navigation instead of `router.push()`. That
 * is intentional (see comment below) and must not be "optimized" to a
 * client-side transition, or the app will intermittently show as still
 * logged out immediately after login.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      // On a dropped connection this throws instead of returning
      // {error} — with no retry/catch, the button was left stuck on
      // "Signing in…" forever with no feedback. Retry first; only show an
      // error once retries are exhausted.
      const { error: signInError } = await retryAsync(() =>
        supabase.auth.signInWithPassword({ email, password }),
      );
      if (signInError) {
        setLoading(false);
        setError(signInError.message);
        return;
      }
    } catch {
      setLoading(false);
      setError('Could not reach the server. Check your connection and try again.');
      return;
    }
    // A client-side router.push()/refresh() here can be served from Next.js's
    // own router cache instead of hitting the server, so middleware never gets
    // a fresh request to see the just-set session cookie. A full navigation
    // guarantees the server actually re-checks auth with the new cookie.
    window.location.href = '/';
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-white p-8">
        <h1 className="mb-1 text-xl font-semibold text-ink">Sign in</h1>
        <p className="mb-6 text-sm text-ink-soft">Prometeia Issue Tracker</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm text-ink">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm text-ink">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              required
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink-soft">
          No account?{' '}
          <Link href="/signup" className="text-brand-blue hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
