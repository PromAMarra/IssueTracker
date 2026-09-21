import { Resend } from 'resend';

/**
 * Lazily-constructed, memoized singleton Resend client used for outbound
 * notification emails (see lib/email/sendNotificationEmail.ts). This is the
 * only file that imports the `resend` package or touches RESEND_API_KEY
 * directly; other modules go through isResendConfigured()/getResendClient().
 */
// Node.js-runtime only — the `resend` SDK is not Edge-safe, so this module
// must never be imported from middleware.ts (Edge runtime). This mirrors the
// Edge/Node split already used in this codebase for undici in
// lib/supabase/fetchWithRetry.ts (Edge-safe) vs
// lib/supabase/fetchWithRetryNode.ts (Node-only, uses a Node-only package).
//
// RESEND_API_KEY does not exist in every environment yet (e.g. local dev
// before the key is provisioned), so callers must be able to check
// isResendConfigured() and skip sending entirely rather than constructing a
// client that would throw.

let client: Resend | null = null;

/** True when RESEND_API_KEY is present and a client can be constructed. */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Lazily constructs (and memoizes) the Resend client. Returns null when
 * RESEND_API_KEY is unset — callers must check for null and skip sending
 * rather than calling into a client that doesn't exist.
 */
export function getResendClient(): Resend | null {
  if (!isResendConfigured()) {
    return null;
  }
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}
