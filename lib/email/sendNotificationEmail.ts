import { getResendClient, isResendConfigured } from './resend';

export interface SendNotificationEmailInput {
  to: string;
  subject: string;
  body: string;
}

// The installed `resend` SDK version has no `signal`/AbortSignal option on
// `emails.send()` (its request options only cover `query`/`headers`/
// `idempotencyKey`), so a hung network call can't be cancelled directly.
// Instead we race the send against a timeout: if the timeout wins, we log
// and return as if the send had failed, but the underlying Resend request
// may still be in flight — that's fine, we just stop waiting on it so the
// caller's Server Action isn't blocked.
const SEND_TIMEOUT_MS = 5000;

class SendTimeoutError extends Error {
  constructor() {
    super(`Resend send() did not settle within ${SEND_TIMEOUT_MS}ms`);
    this.name = 'SendTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SendTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
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

    const { error } = await withTimeout(
      client.emails.send({
        from,
        to,
        subject,
        text: body,
      }),
      SEND_TIMEOUT_MS,
    );

    if (error) {
      console.warn('[sendNotificationEmail] Resend returned an error:', error);
    }
  } catch (err) {
    console.warn('[sendNotificationEmail] failed to send notification email:', err);
  }
}
