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
