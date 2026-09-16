import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('./resend', () => ({
  isResendConfigured: vi.fn(),
  getResendClient: vi.fn(),
}));

import { getResendClient, isResendConfigured } from './resend';
import { sendNotificationEmail } from './sendNotificationEmail';

const mockedIsResendConfigured = vi.mocked(isResendConfigured);
const mockedGetResendClient = vi.mocked(getResendClient);

describe('sendNotificationEmail', () => {
  const originalFromEmail = process.env.NOTIFICATION_FROM_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockReset();
    process.env.NOTIFICATION_FROM_EMAIL = 'notifications@example.com';
  });

  afterEach(() => {
    if (originalFromEmail === undefined) {
      delete process.env.NOTIFICATION_FROM_EMAIL;
    } else {
      process.env.NOTIFICATION_FROM_EMAIL = originalFromEmail;
    }
  });

  it('calls send with the right to/subject/from when Resend is configured', async () => {
    mockedIsResendConfigured.mockReturnValue(true);
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    mockedGetResendClient.mockReturnValue({ emails: { send: sendMock } } as any);

    await sendNotificationEmail({
      to: 'user@example.com',
      subject: 'You have a new task',
      body: 'Please review the item.',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'You have a new task',
        from: 'notifications@example.com',
      }),
    );
  });

  it('does not throw when the Resend send call rejects', async () => {
    mockedIsResendConfigured.mockReturnValue(true);
    sendMock.mockRejectedValue(new Error('network down'));
    mockedGetResendClient.mockReturnValue({ emails: { send: sendMock } } as any);

    await expect(
      sendNotificationEmail({
        to: 'user@example.com',
        subject: 'You have a new task',
        body: 'Please review the item.',
      }),
    ).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('no-ops without calling send when RESEND_API_KEY is unset', async () => {
    mockedIsResendConfigured.mockReturnValue(false);

    await sendNotificationEmail({
      to: 'user@example.com',
      subject: 'You have a new task',
      body: 'Please review the item.',
    });

    expect(mockedGetResendClient).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
