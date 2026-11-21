import { createAuth, type AuthEnv } from '../../_lib/auth';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';
import { isDisposableEmail } from '../../_lib/disposableEmail';
import { verifyTurnstile } from '../../_lib/turnstile';

/** Better Auth-shaped error body: its client exposes `code` / `message`
 *  as error.code / error.message. */
function authError(code: string, message: string, status: number): Response {
  return Response.json({ code, message }, { status });
}

// Catchall — Better Auth owns every /api/auth/* path, including magic-link
// send / verify / get-session / sign-out. Adding individual routes alongside
// this file would shadow the auth handler and break those flows.
//
// Pre-flight: rate-limit the magic-link send endpoint before it reaches
// Better Auth. Better Auth has a built-in rate limit but defaults to memory
// storage, which on CF Pages is per-isolate — trivial to bypass by routing
// to different isolates. Our cache-based limiter is per-colo across all
// isolates in a colo, which is meaningfully harder to bypass for
// mail-bombing attacks.
export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/auth/sign-in/magic-link' ||
      url.pathname.endsWith('/sign-in/magic-link'))
  ) {
    /* Per-IP cap — covers anonymous probing attacks. 5 sign-in requests
     * in 10 minutes is plenty for a real human (one for typo recovery,
     * one for the actual send; rest is buffer). */
    const ipResult = await rateLimit(
      request,
      { waitUntil },
      { bucket: 'auth-ml-ip', limit: 5, windowSec: 600 },
    );
    if (!ipResult.ok) return rateLimitResponse(ipResult);

    /* Peek at the body for the email; clone first so Better Auth's
     * handler still has a fresh body to parse. Malformed body → leave
     * emailKey null and let Better Auth respond with its own 400. */
    let emailKey: string | null = null;
    try {
      const body = (await request.clone().json()) as { email?: unknown };
      if (typeof body.email === 'string' && body.email.trim().length > 0) {
        emailKey = body.email.toLowerCase().trim();
      }
    } catch {
      /* fall through */
    }

    /* Throwaway inboxes are the cheapest way to mint scam profiles.
     * Cheapest check, so it runs first. `code` lets AuthModal show a
     * localized message (Better Auth's client surfaces it as error.code). */
    if (emailKey && isDisposableEmail(emailKey)) {
      return authError('DISPOSABLE_EMAIL', 'Disposable email addresses are not allowed.', 400);
    }

    /* Bot check. Token rides in a header rather than the JSON body so
     * Better Auth's body schema never sees it. Runs before the per-email
     * limiter so a bot spamming someone's inbox can't burn that inbox's
     * budget and lock the real owner out. Skipped only when the secret
     * isn't configured (local dev). */
    if (env.TURNSTILE_SECRET_KEY) {
      const human = await verifyTurnstile(
        env.TURNSTILE_SECRET_KEY,
        request.headers.get('x-turnstile-token') ?? undefined,
        request.headers.get('cf-connecting-ip'),
      );
      if (!human) {
        return authError('TURNSTILE_FAILED', "Couldn't verify you're human — please try again.", 403);
      }
    }

    /* Per-email cap — protects a specific inbox from a rotating-IP attacker. */
    if (emailKey) {
      const emailResult = await rateLimit(
        request,
        { waitUntil },
        { bucket: 'auth-ml-email', limit: 3, windowSec: 3600, keyOverride: emailKey },
      );
      if (!emailResult.ok) return rateLimitResponse(emailResult);
    }
  }

  const auth = createAuth(env);
  return auth.handler(request);
};
