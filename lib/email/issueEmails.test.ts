import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commentAddedEmail,
  commentEmailRecipientIds,
  issueAssignedEmail,
  issueKeyPrefix,
  issueUrl,
  statusChangedEmail,
  statusEmailLabel,
  type IssueEmailContext,
} from './issueEmails';

const ctx: IssueEmailContext = {
  issueId: 'issue-uuid',
  engagementId: 'engagement-uuid',
  key: 'ESUP-12',
  title: 'Rate table rounds to 2 decimals',
};

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
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
  it('is null when NEXT_PUBLIC_SITE_URL is unset', () => {
    expect(issueUrl(ctx)).toBeNull();
  });

  it('builds the same deep link the in-app bell uses', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tracker.example.com';
    expect(issueUrl(ctx)).toBe('https://tracker.example.com/engagement-uuid/board?issue=issue-uuid');
  });

  it('tolerates a trailing slash on the configured base URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tracker.example.com/';
    expect(issueUrl(ctx)).toBe('https://tracker.example.com/engagement-uuid/board?issue=issue-uuid');
  });
});

describe('statusEmailLabel', () => {
  it('humanises the raw status enum', () => {
    expect(statusEmailLabel('ready_for_test', false)).toBe('Ready for Test');
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
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tracker.example.com';
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
    const { subject, body } = statusChangedEmail(ctx, 'Ready for Test');
    expect(subject).toBe('[ESUP] ESUP-12 status changed to Ready for Test');
    expect(body).toContain('is now "Ready for Test"');
  });
});

describe('commentEmailRecipientIds', () => {
  it('emails both reporter and assignee when a third party comments', () => {
    expect(
      commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', authorId: 'x' }),
    ).toEqual(['r', 'a']);
  });

  it('never emails the comment author their own comment', () => {
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', authorId: 'r' })).toEqual([
      'a',
    ]);
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'a', authorId: 'a' })).toEqual([
      'r',
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

  it('emails nobody when the reporter comments on their own unassigned ticket', () => {
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: null, authorId: 'r' })).toEqual(
      [],
    );
  });

  it('emails nobody when the reporter is also the assignee and comments', () => {
    expect(commentEmailRecipientIds({ reporterId: 'r', assigneeId: 'r', authorId: 'r' })).toEqual(
      [],
    );
  });
});
