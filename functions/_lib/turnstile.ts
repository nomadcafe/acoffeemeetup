/**
 * Cloudflare Turnstile server-side check. Tokens are single-use and valid
 * for 300s; `remoteip` lets Cloudflare tie the token to the solving client.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  remoteIp: string | null,
): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);
  try {
    const r = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) {
      console.error('[turnstile] siteverify HTTP', r.status);
      return false;
    }
    const json = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!json.success) console.warn('[turnstile] rejected', json['error-codes']);
    return json.success === true;
  } catch (e) {
    console.error('[turnstile] siteverify failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}
