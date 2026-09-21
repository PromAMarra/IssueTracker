import type { Status } from '../types';

/**
 * Pure content builders for issue-related notification emails (assignment,
 * comment, status change) and the recipient-id logic that decides who gets
 * them. No I/O here — callers (Server Actions) pass the resulting
 * subject/body into lib/email/sendNotificationEmail.ts, and pass the
 * recipient ids to look up addresses and send individually.
 *
 * Critical gotcha: this is a deliberate DUAL-WRITE with the DB triggers
 * `notify_status_changed` and `notify_comment_added` (see migration 0014),
 * which create the in-app notification rows independently. The
 * recipient-selection functions below are written to mirror those triggers'
 * logic exactly. If a trigger's notification rules ever change, this file
 * must be updated to match, or in-app notifications and emails will silently
 * diverge (e.g. someone gets emailed about an event they don't see a bell
 * notification for, or vice versa) — there is no shared source of truth
 * enforcing the two stay in sync.
 */
const APP_NAME = 'Prometeia Issue Tracker';

export type IssueEmailContext = {
  issueId: string;
  engagementId: string;
  key: string;
  title: string;
};

export type NotificationEmailContent = {
  subject: string;
  body: string;
};

// Emails go to bank users as well as Prometeia, so the raw enum value
// ("ready_for_test") would read as a bug in an inbox. The same map already
// exists in several client components; it is duplicated here rather than
// imported so a Server Action never has to pull in a client component.
const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

/**
 * Mirrors the `notify_status_changed` DB trigger's label logic: going from
 * closed back to an open status reads as "Reopened", not as the raw status.
 */
export function statusEmailLabel(status: Status, isReopen: boolean): string {
  return isReopen ? 'Reopened' : STATUS_LABELS[status];
}

/**
 * The engagement's `key_prefix`, recovered from the issue key itself
 * ("ESUP-12" -> "ESUP") so no call site needs an extra engagements query.
 * `next_issue_key` builds keys as `key_prefix || '-' || seq`, and
 * `sanitizeKeyPrefix` strips "-" from prefixes, so the last "-" always splits.
 */
export function issueKeyPrefix(key: string): string {
  const dash = key.lastIndexOf('-');
  return dash > 0 ? key.slice(0, dash) : key;
}

/**
 * Deep link to the ticket, matching NotificationBell's in-app route. Returns
 * null when SITE_URL is unset, in which case the email carries the
 * ticket key and title but no link (rather than a broken relative URL).
 */
export function issueUrl(ctx: IssueEmailContext): string | null {
  const base = process.env.SITE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/${ctx.engagementId}/board?issue=${ctx.issueId}`;
}

function composeBody(ctx: IssueEmailContext, lines: string[]): string {
  const url = issueUrl(ctx);
  return [
    `${ctx.key}: ${ctx.title}`,
    '',
    ...lines,
    ...(url ? ['', `View the ticket: ${url}`] : []),
    '',
    `— ${APP_NAME}`,
  ].join('\n');
}

export function issueAssignedEmail(ctx: IssueEmailContext): NotificationEmailContent {
  return {
    subject: `[${issueKeyPrefix(ctx.key)}] Ticket ${ctx.key} assigned to you`,
    body: composeBody(ctx, ['This ticket has been assigned to you.']),
  };
}

export function commentAddedEmail(
  ctx: IssueEmailContext,
  authorName: string,
): NotificationEmailContent {
  return {
    subject: `[${issueKeyPrefix(ctx.key)}] New comment on ${ctx.key}`,
    // The comment text itself is deliberately left out, matching the in-app
    // notification — the email says something happened, the app shows what.
    body: composeBody(ctx, [`${authorName} added a comment.`]),
  };
}

export function statusChangedEmail(
  ctx: IssueEmailContext,
  label: string,
): NotificationEmailContent {
  return {
    subject: `[${issueKeyPrefix(ctx.key)}] ${ctx.key} status changed to ${label}`,
    body: composeBody(ctx, [`The status of this ticket is now "${label}".`]),
  };
}

/**
 * Who hears about a new comment: everyone involved in the ticket, including
 * the person who just wrote it. Mirrors the `notify_comment_added` trigger
 * exactly (see migration 0014) — always the reporter, plus the assignee unless
 * they are already the reporter. That last check is a dedupe, not self-action
 * suppression: it keeps one person who is both reporter and assignee from
 * being emailed twice about a single comment. The author is deliberately NOT
 * excluded — users asked to be notified about their own actions too — so a
 * reporter commenting on their own ticket does get their own email.
 * `authorId` is still taken because the caller has it and the parity with the
 * trigger's signature is worth keeping, but it no longer filters anyone out.
 */
export function commentEmailRecipientIds({
  reporterId,
  assigneeId,
}: {
  reporterId: string;
  assigneeId: string | null;
  authorId: string;
}): string[] {
  const recipients: string[] = [reporterId];
  if (assigneeId && assigneeId !== reporterId) {
    recipients.push(assigneeId);
  }
  return recipients;
}

/**
 * Who hears about a status change: mirrors the `notify_status_changed`
 * trigger's two insert blocks exactly (see migration 0014) — always the
 * reporter, plus the assignee unless they are already the reporter. As with
 * comments, the person who made the change is NOT excluded; the surviving
 * `!== reporterId` check is a dedupe, so a reporter who is also the assignee
 * is emailed once rather than twice. `actorId` is therefore no longer a
 * filter, but is kept in the signature so call sites and tests can still
 * state who acted.
 *
 * `assigneeId` must be the assignee as of *after* the update lands (the
 * trigger reads `new.assignee_id`), not necessarily whatever it was before:
 * on a closing change the app hands the ticket back to the reporter first, so
 * by the time this runs the assignee and reporter are the same person and the
 * assignee branch is naturally a no-op, exactly as it is in the trigger. An
 * unassigned ticket, or one whose assignee is already the reporter, notifies
 * the reporter alone.
 */
export function statusChangedEmailRecipientIds({
  reporterId,
  assigneeId,
}: {
  reporterId: string;
  assigneeId: string | null;
  actorId: string;
}): string[] {
  const recipients: string[] = [reporterId];
  if (assigneeId && assigneeId !== reporterId) {
    recipients.push(assigneeId);
  }
  return recipients;
}
