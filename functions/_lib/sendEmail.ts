import type { Resend } from 'resend';

type SendPayload = Parameters<Resend['emails']['send']>[0];

/**
 * `resend.emails.send()` never throws on API failure — it resolves to
 * `{ data: null, error }` (bad key, unverified From domain, rate limit,
 * invalid recipient…). Awaiting it bare silently drops the email while the
 * caller reports success. This wrapper turns that into a thrown Error so
 * existing try/catch blocks log it and the magic-link flow surfaces it.
 */
export async function sendEmail(resend: Resend, payload: SendPayload) {
  const { data, error } = await resend.emails.send(payload);
  if (error) {
    console.error('[resend] send failed', {
      name: error.name,
      message: error.message,
      subject: payload.subject,
    });
    throw new Error(`Resend ${error.name}: ${error.message}`);
  }
  return data;
}
