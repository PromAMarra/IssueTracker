import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commentAddedEmail,
  commentEmailRecipientIds,
  issueAssignedEmail,
  issueKeyPrefix,
  issueUrl,
  statusChangedEmail,
  statusChangedEmailRecipientIds,
  statusEmailLabel,
  type IssueEmailContext,
} from './issueEmails';

const ctx: IssueEmailContext = {
  issueId: 'issue-uuid',
  engagementId: 'engagement-uuid',
  key: 'ESUP-12',
  title: 'Rate table rounds to 2 decimals',
};

const originalSiteUrl = process.env.SITE_URL;

beforeEach(() => {
  delete process.env.SITE_URL;
});

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = originalSiteUrl;
  }
});

describe('issueKeyPrefix', () => {
  it('recovers the engagement prefix from an issue key', () => {
    expect(issueKeyPrefix('ESUP-12')).toBe('ESUP');
    expect(issueKeyPrefix('ENG-1')).toBe('ENG');
  });

  it('falls back to the whole key when there is no sequence separator', () => {
    expect(issueKeyPrefix('ESUP')).toBe('ESUP');
  });
});

describe('issueUrl', () => {
  it('is null when SITE_URL is unset', () => {
    expect(issueUrl(ctx)).toBeNull();
  });

  it('builds the same deep link the in-app bell uses', () => {
    process.env.SITE_URL = 'https://tracker.example.com';
    expect(issueUrl(ctx)).toBe('https://tracker.example.com/engagement-uuid/board?issue=issue-uuid');
  });

  it('tolerates a trailing slash on the configured base URL', () => {
    process.env.SITE_URL = 'https://tracker.example.com/';
    expect(issueUrl(ctx)).toBe('https://tracker.example.com/engagement-uuid/board?issue=issue-uuid');
  });
});

describe('statusEmailLabel', () => {
  it('humanises the raw status enum', () => {
    expect(statusEmailLabel('ready_for_test', false)).toBe('Ready For Test');
    expect(statusEmailLabel('closed', false)).toBe('Closed');
  });

  it('reports a reopen as "Reopened", matching the DB trigger', () => {
    expect(statusEmailLabel('ongoing', true)).toBe('Reopened');
  });
});

describe('email content', () => {
  it('names the ticket in the assignment subject and title in the body', () => {
    const { subject, body } = issueAssignedEmail(ctx);
    expect(subject).toBe('[ESUP] Ticket ESUP-12 assigned to you');
    expect(body).toContain('ESUP-12: Rate table rounds to 2 decimals');
    expect(body).toContain('assigned to you');
  });

  it('omits the link line entirely when no site URL is configured', () => {
    expect(issueAssignedEmail(ctx).body).not.toContain('View the ticket');
  });

  it('includes the link when a site URL is configured', () => {
    process.env.SITE_URL = 'https://tracker.example.com';
    expect(issueAssignedEmail(ctx).body).toContain(
      'View the ticket: https://tracker.example.com/engagement-uuid/board?issue=issue-uuid',
    );
  });

  it('credits the comment author without quoting the comment body', () => {
    const { subject, body } = commentAddedEmail(ctx, 'Giulia Rossi');
    expect(subject).toBe('[ESUP] New comment on ESUP-12');
    expect(body).toContain('Giulia Rossi added a comment.');
  });

  it('states the new status label', () => {
    const { subject, body } = statusChangedEmail(ctx, 'Ready For Test');
    expect(subject).toBe('[ESUP] ESUP-12 status changed to Ready For Test');
    expect(body).toContain('is now "Ready For Test"');
  });
});

describe('commentEmailRecipientIds', () => {
  it('emails both reporter and assignee when a third party comments', () => {
    expect(
      commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', authorId: 'x' }),
    ).toEqual(['r', 'a']);
  });

  it('emails the comment author too when they are on the ticket', () => {
    // Self-action suppression was removed (migration 0014): a reporter or
    // assignee who comments hears about their own comment like anyone else.
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', authorId: 'r' })).toEqual([
      'r',
      'a',
    ]);
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', authorId: 'a' })).toEqual([
      'r',
      'a',
    ]);
  });

  it('still emails the reporter when the ticket is unassigned', () => {
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: null, authorId: 'x' })).toEqual([
      'r',
    ]);
  });

  it('dedupes when reporter and assignee are the same person', () => {
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'r', authorId: 'x' })).toEqual([
      'r',
    ]);
  });

  it('emails the reporter when they comment on their own unassigned ticket', () => {
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: null, authorId: 'r' })).toEqual([
      'r',
    ]);
  });

  it('emails a reporter who is also the assignee and author exactly once', () => {
    // Both mechanisms at play: self-notification now happens (so not zero),
    // and the reporter/assignee dedupe still holds (so not twice).
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'r', authorId: 'r' })).toEqual([
      'r',
    ]);
  });
});

describe('statusChangedEmailRecipientIds', () => {
  it('emails both reporter and assignee for a non-closing change by a third party', () => {
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', actorId: 'x' }),
    ).toEqual(['r', 'a']);
  });

  it('emails the actor who made the change too when they are on the ticket', () => {
    // Self-action suppression was removed (migration 0014): a reporter or
    // assignee who moves the ticket is notified like anyone else.
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', actorId: 'r' }),
    ).toEqual(['r', 'a']);
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', actorId: 'a' }),
    ).toEqual(['r', 'a']);
  });

  it('still emails the reporter when the ticket is unassigned', () => {
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: null, actorId: 'x' }),
    ).toEqual(['r']);
  });

  it('dedupes when reporter and assignee are the same person', () => {
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: 'r', actorId: 'x' }),
    ).toEqual(['r']);
  });

  it('emails the reporter when they change their own unassigned ticket', () => {
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: null, actorId: 'r' }),
    ).toEqual(['r']);
  });

  it('emails a reporter who is also the assignee and actor exactly once', () => {
    // Both mechanisms at play: self-notification now happens (so not zero),
    // and the reporter/assignee dedupe still holds (so not twice). This is
    // also the shape of a Prometeia user closing a ticket they reported.
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: 'r', actorId: 'r' }),
    ).toEqual(['r']);
  });

  it('matches the trigger on a closing change: passing a null assignee skips the old assignee entirely', () => {
    // `updateIssueStatus` passes `null` for `assigneeId` on a closing change
    // (the ticket has already been reassigned to the reporter by then), so
    // the pre-update assignee must never appear here even though they were a
    // real, distinct assignee moments before.
    expect(
      statusChangedEmailRecipientIds({ reporterId: 'r', assigneeId: null, actorId: 'x' }),
    ).toEqual(['r']);
  });
});
