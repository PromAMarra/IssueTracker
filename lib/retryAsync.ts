/**
 * Small, dependency-free retry-with-backoff utility used anywhere a
 * transient network blip shouldn't surface as a hard failure to the user.
 * Environment-agnostic (plain `setTimeout`/`Promise`), so it can wrap calls
 * made from client components as well as from server code.
 *
 * Gotcha: `retryAsync` retries on ANY thrown error, unconditionally — it does
 * not inspect the error to distinguish a transient network drop from a
 * genuine application error (bad input, a 4xx from Supabase, a thrown
 * validation error, etc.). Callers must therefore only wrap operations that
 * are safe to blindly re-invoke multiple times (idempotent reads, or writes
 * that are safe to retry/upsert), never a mutation that could have partially
 * succeeded before throwing, or the retry could double-apply it.
 */
// Generic retry with exponential backoff for any async call that can fail
// outright on a dropped connection (as opposed to returning a normal
// error result). Works in the browser or Node — no environment-specific
// APIs — unlike fetchWithRetry(Node)/fetchWithRetryNode.ts, which patch
// fetch specifically for server-side Supabase clients.
export async function retryAsync<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === attempts) throw err;
      // 400ms, 800ms, 1.6s — enough to ride out a short drop without making
      // the user stare at a spinner for too long before a real error shows.
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    }
  }
  throw new Error('unreachable');
}
