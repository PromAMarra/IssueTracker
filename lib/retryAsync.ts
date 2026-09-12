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
