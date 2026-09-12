// This environment's outbound connection to Supabase intermittently fails a
// single request outright (fetch throws instead of returning a response).
// Retry a couple of times with backoff before giving up — a subsequent
// attempt usually succeeds. Edge-runtime-safe (plain fetch, no Node built-ins)
// so it can be used from middleware; see fetchWithRetryNode.ts for the
// Node.js-runtime version used by Server Components/Actions, which also
// works around a dead-connection-reuse issue undici's default agent hits.
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = 5,
): Promise<Response> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (attempt === attempts) throw err;
      // exponential backoff: 400ms, 800ms, 1.6s, 3.2s — rides out a several-
      // second outage instead of giving up after one second like before.
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    }
  }
  throw new Error('unreachable');
}
