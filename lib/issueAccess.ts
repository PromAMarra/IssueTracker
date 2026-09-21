import type { Status } from './types';

/**
 * Client/server-side (JS-level) authorization helpers for the issue lifecycle
 * state machine described by `Status` (lib/types.ts): backlog -> ongoing ->
 * ready_for_test -> closed, with `rejected` as a side branch back to ongoing.
 *
 * This module answers two related but separate questions:
 *   1. "Whose turn is it?" — issueTurnIsProm / canPostOnIssue / turnLockedMessage.
 *      The Board alternates "possession" of a ticket between Prometeia and
 *      Bank/SIT; only the side currently holding it may add comments or
 *      attachments. Used by app/actions/issues.ts to gate comment/attachment
 *      writes and by the UI to disable the comment form with an explanatory
 *      message.
 *   2. "What status changes can Bank/SIT make directly?" —
 *      BANK_SIT_ALLOWED_TRANSITIONS. A deliberately narrow allowlist: Bank/SIT
 *      users may only dispute a rejection (rejected -> ongoing) or resolve a
 *      fix Prometeia marked ready (ready_for_test -> closed | rejected).
 *
 * CRITICAL / gotcha for anyone touching this file: everything here is a
 * convenience for the UI (early rejection, building dropdown options,
 * friendly error text) — it is NOT the real security boundary. All Server
 * Actions run with the Supabase ANON key plus the caller's session cookies,
 * so Postgres Row-Level Security is the actual authorization boundary. The
 * RLS policy + trigger in supabase/migrations/0021_bank_sit_transitions.sql
 * independently re-implements the same narrowing at the database layer. If
 * you change BANK_SIT_ALLOWED_TRANSITIONS here, you MUST update that
 * migration to match, or the UI and the database will disagree about which
 * transitions a Bank/SIT user may perform.
 */
/** Which side currently owns the ticket and may post to it, based on status. */
export function issueTurnIsProm(status: Status): boolean {
  return status === 'backlog' || status === 'ongoing';
}

/** Can this actor (Prometeia or not) add a comment/attachment to a ticket in this status? */
export function canPostOnIssue(status: Status, isProm: boolean): boolean {
  return issueTurnIsProm(status) === isProm;
}

/** User-facing explanation for why posting is blocked right now. */
export function turnLockedMessage(status: Status): string {
  return issueTurnIsProm(status)
    ? "This ticket is currently with Prometeia — you'll be able to add comments and attachments once it's back with Bank/SIT."
    : "This ticket is currently with Bank/SIT — you'll be able to add comments and attachments once it's back with Prometeia.";
}

// The only statuses a non-Prometeia (Bank/SIT) member may set directly, and
// the only status(es) they may set them to — enforced again at the DB layer
// by the issues_update_bank_sit_transition RLS policy + trigger (see
// 0021_bank_sit_transitions.sql), so this map and that migration must be
// kept in sync. Defined once here so the client (for building the allowed
// dropdown options) and the server (for validating the actual change) can
// never drift apart.
export const BANK_SIT_ALLOWED_TRANSITIONS: Partial<Record<Status, Status[]>> = {
  rejected: ['ongoing'],
  ready_for_test: ['closed', 'rejected'],
};
