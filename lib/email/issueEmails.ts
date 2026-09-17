import type { Status } from '../types';

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
 * null when NEXT_PUBLIC_SITE_URL is unset, in which case the email carries the
 * ticket key and title but no link (rather than a broken relative URL).
 */
export function issueUrl(ctx: IssueEmailContext): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
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
 * Who hears about a new comment: everyone involved in the ticket except the
 * person who just wrote it. Mirrors the `notify_comment_added` trigger exactly
 * — reporter unless they are the author, plus the assignee unless they are the
 * author or are already the reporter. An unassigned ticket still notifies the
 * reporter; a ticket the reporter comments on themselves with no other
 * assignee notifies nobody.
 */
export function commentEmailRecipientIds({
  reporterId,
  assigneeId,
  authorId,
}: {
  reporterId: string;
  assigneeId: string | null;
  authorId: string;
}): string[] {
  const recipients: string[] = [];
  if (reporterId !== authorId) recipients.push(reporterId);
  if (assigneeId && assigneeId !== authorId && assigneeId !== reporterId) {
    recipients.push(assigneeId);
  }
  return recipients;
}

/**
 * Who hears about a status change: mirrors the `notify_status_changed`
 * trigger's two insert blocks exactly — reporter unless they are the one who
 * made the change, plus the assignee unless they are the one who made the
 * change or are already the reporter. `assigneeId` must be the assignee as
 * of *after* the update lands (the trigger reads `new.assignee_id`), not
 * necessarily whatever it was before: on a closing change the app hands the
 * ticket back to the reporter first, so by the time this runs the assignee
 * and reporter are the same person and the assignee branch is naturally a
 * no-op, exactly as it is in the trigger. An unassigned ticket, or one where
 * the assignee is already the reporter or is the person making the change,
 * only ever notifies the reporter (or nobody, if the reporter is also the
 * one making the change).
 */
export function statusChangedEmailRecipientIds({
  reporterId,
  assigneeId,
  actorId,
}: {
  reporterId: string;
  assigneeId: string | null;
  actorId: string;
}): string[] {
  const recipients: string[] = [];
  if (reporterId !== actorId) recipients.push(reporterId);
  if (assigneeId && assigneeId !== actorId && assigneeId !== reporterId) {
    recipients.push(assigneeId);
  }
  return recipients;
}
