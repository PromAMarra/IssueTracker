import { getResendClient, isResendConfigured } from './resend';

export interface SendNotificationEmailInput {
  to: string;
  subject: string;
  body: string;
}

/**
 * Fire-and-forget notification email, sent via Resend. Never throws: a
 * failure to send must never fail or roll back the caller's own mutation.
 *
 * No-ops (with a debug log) when RESEND_API_KEY or NOTIFICATION_FROM_EMAIL
 * is unset, which is expected in environments where Resend hasn't been
 * provisioned yet.
 */
export async function sendNotificationEmail({
  to,
  subject,
  body,
}: SendNotificationEmailInput): Promise<void> {
  if (!isResendConfigured()) {
    console.debug('[sendNotificationEmail] RESEND_API_KEY is unset — skipping email send');
    return;
  }

  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!from) {
    console.warn('[sendNotificationEmail] NOTIFICATION_FROM_EMAIL is unset — skipping email send');
    return;
  }

  try {
    const client = getResendClient();
    if (!client) {
      // Shouldn't happen given the isResendConfigured() check above, but
      // guards against a race/refactor rather than throwing.
      return;
    }

    const { error } = await client.emails.send({
      from,
      to,
      subject,
      text: body,
    });

    if (error) {
      console.warn('[sendNotificationEmail] Resend returned an error:', error);
    }
  } catch (err) {
    console.warn('[sendNotificationEmail] failed to send notification email:', err);
  }
}
