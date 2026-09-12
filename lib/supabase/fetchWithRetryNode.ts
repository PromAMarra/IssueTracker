import { Agent, fetch as undiciFetch } from 'undici';

// Node.js-runtime only (pulls in Node built-ins via undici — do not import
// this from middleware.ts, which runs in the Edge runtime and can't bundle
// it). Used by lib/supabase/server.ts for Server Components/Actions.
//
// A brand-new Node process reaches Supabase instantly and reliably every
// time; this long-running server needs several failed attempts before one
// succeeds. That gap points at a dead pooled keep-alive connection being
// retried instead of a real outage — something on this network (Cato) is
// silently killing idle sockets without the client noticing, and undici's
// default agent keeps a connection alive for 4s, long enough to hand out a
// socket that's already dead. Evicting idle sockets almost immediately
// forces a fresh connection far more often, trading a little latency for
// reliability.
const shortLivedAgent = new Agent({ keepAliveTimeout: 200, keepAliveMaxTimeout: 200 });

export async function fetchWithRetryNode(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = 5,
): Promise<Response> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // undici's own fetch, not Node's global one — mixing an externally
      // installed undici Agent into Node's internal fetch throws
      // (InvalidArgumentError: invalid onRequestStart method) because their
      // bundled undici versions have diverged.
      return (await (undiciFetch as any)(input, {
        ...init,
        dispatcher: shortLivedAgent,
      })) as Response;
    } catch (err) {
      if (attempt === attempts) throw err;
      // exponential backoff: 400ms, 800ms, 1.6s, 3.2s — rides out a several-
      // second outage instead of giving up after one second like before.
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    }
  }
  throw new Error('unreachable');
}
