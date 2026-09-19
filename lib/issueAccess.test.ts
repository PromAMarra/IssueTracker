import { describe, expect, it } from 'vitest';
import { canPostOnIssue, issueTurnIsProm, turnLockedMessage } from './issueAccess';
import { STATUSES } from './types';
import type { Status } from './types';

describe('issueTurnIsProm', () => {
  const expected: Record<Status, boolean> = {
    backlog: true,
    ongoing: true,
    ready_for_test: false,
    closed: false,
    rejected: false,
  };

  it.each(STATUSES)('returns %s for status %s', (status) => {
    expect(issueTurnIsProm(status)).toBe(expected[status]);
  });
});

describe('canPostOnIssue', () => {
  // Exact expected boolean per (status, isProm) pair, spelled out so a future
  // change to STATUSES or the turn mapping breaks this test loudly instead of
  // silently drifting.
  const expected: Record<Status, { isProm: boolean; other: boolean }> = {
    backlog: { isProm: true, other: false },
    ongoing: { isProm: true, other: false },
    ready_for_test: { isProm: false, other: true },
    closed: { isProm: false, other: true },
    rejected: { isProm: false, other: true },
  };

  it.each(STATUSES)('status %s: Prometeia can post exactly when it is their turn', (status) => {
    expect(canPostOnIssue(status, true)).toBe(expected[status].isProm);
  });

  it.each(STATUSES)('status %s: Bank/SIT can post exactly when it is their turn', (status) => {
    expect(canPostOnIssue(status, false)).toBe(expected[status].other);
  });
});

describe('turnLockedMessage', () => {
  it('returns a non-empty message when it is Prometeia\'s turn (backlog)', () => {
    expect(turnLockedMessage('backlog').length).toBeGreaterThan(0);
  });

  it('returns a non-empty message when it is Bank/SIT\'s turn (ready_for_test)', () => {
    expect(turnLockedMessage('ready_for_test').length).toBeGreaterThan(0);
  });

  it('mentions Prometeia in the message shown when it is their turn', () => {
    expect(turnLockedMessage('ongoing')).toMatch(/Prometeia/);
  });

  it('mentions Bank/SIT in the message shown when it is their turn', () => {
    expect(turnLockedMessage('closed')).toMatch(/Bank\/SIT/);
  });
});
