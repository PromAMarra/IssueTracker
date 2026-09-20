import type { Status } from './types';

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
