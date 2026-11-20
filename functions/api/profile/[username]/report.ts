import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { user } from '../../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../../_lib/passport';
import {
  adminProfileUrl,
  loadReviewSnapshot,
  makeAdminProfileToken,
  renderProfileFacts,
} from '../../../_lib/profileReview';
import { rateLimit, rateLimitResponse } from '../../../_lib/rateLimit';
import { sendEmail } from '../../../_lib/sendEmail';

/**
 * Visitor report on a public profile. No table: the report goes straight to
 * the admin inbox (ADMIN_EMAIL) with the profile's current content and the
 * same signed review / take-down link as the review notifications.
 *
 * Abuse limits (Cache-API counters, per colo — fine at this scale):
 *   - 5 reports per IP per hour across all profiles;
 *   - one report per IP per profile per day (repeat taps are accepted
 *     silently, not re-sent);
 *   - 10 report emails per profile per day, so a profile can't be used to
 *     flood the admin inbox.
 */

const REASONS = ['spam', 'inappropriate', 'impersonation', 'other'] as const;

const InputSchema = z.object({
  reason: z.enum(REASONS),
  details: z.string().trim().max(500).optional(),
});

const REASON_LABEL: Record<(typeof REASONS)[number], string> = {
  spam: 'Spam or scam',
  inappropriate: 'Inappropriate content',
  impersonation: 'Impersonation',
  other: 'Other',
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  const username = typeof params.username === 'string' ? params.username.toLowerCase() : '';
  if (!username) return jsonError('Missing username', 400);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return jsonError('Invalid report', 400);
  }

  const ipLimit = await rateLimit(request, { waitUntil }, { bucket: 'report-ip', limit: 5, windowSec: 3600 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const db = getDb(env);
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));
  // Same 404 for missing and private profiles, like the profile read.
  if (!target) return jsonError('Profile not found', 404);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const dedupe = await rateLimit(
    request,
    { waitUntil },
    { bucket: 'report-dedupe', limit: 1, windowSec: 86_400, keyOverride: `${ip}:${target.id}` },
  );
  // Already reported today from here: say thanks, don't email again.
  if (!dedupe.ok) return Response.json({ ok: true });

  const perProfile = await rateLimit(
    request,
    { waitUntil },
    { bucket: 'report-profile', limit: 10, windowSec: 86_400, keyOverride: target.id },
  );
  if (!perProfile.ok) {
    console.warn('[report] daily per-profile cap reached', { username });
    return Response.json({ ok: true });
  }

  console.warn('[report] profile reported', { username, reason: input.reason });

  if (env.ADMIN_EMAIL && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    const snapshot = await loadReviewSnapshot(db, target.id);
    const reporter = await getSessionUser(env, request).catch(() => null);
    if (snapshot) {
      const origin = 'https://acoffee.com';
      const token = await makeAdminProfileToken(env.AUTH_SECRET, target.id);
      const reviewUrl = adminProfileUrl(origin, target.id, token);
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px">
<h2 style="font-size:18px;color:#2c1810;margin:0 0 4px">Report: @${esc(username)}</h2>
<p style="margin:0 0 4px;font-size:14px;color:#b3261e"><strong>${esc(REASON_LABEL[input.reason])}</strong></p>
${input.details ? `<p style="margin:0 0 12px;font-size:14px;color:#2c1810;white-space:pre-wrap">${esc(input.details)}</p>` : ''}
<p style="margin:0 0 16px;font-size:12px;color:#7a6a60">Reported by ${reporter ? `signed-in user ${esc(reporter.email)}` : 'an anonymous visitor'}.</p>
${renderProfileFacts(snapshot, origin)}
<p style="margin:20px 0 0">
<a href="${origin}/${encodeURIComponent(username)}" style="display:inline-block;padding:8px 16px;border:1px solid #c9b8a8;border-radius:999px;color:#2c1810;text-decoration:none;margin-right:8px">View profile</a>
<a href="${reviewUrl}" style="display:inline-block;padding:8px 16px;background:#b3261e;border-radius:999px;color:#fff;text-decoration:none">Review / take down</a>
</p>
</div>`;
      try {
        await sendEmail(new Resend(env.RESEND_API_KEY), {
          from: env.RESEND_FROM_EMAIL,
          to: env.ADMIN_EMAIL,
          subject: `[ACoffee report] @${username} — ${REASON_LABEL[input.reason]}`,
          html,
        });
      } catch (e) {
        console.error('[report] email failed', {
          username,
          err: e instanceof Error ? e.message : String(e),
        });
        return jsonError("Couldn't send the report right now. Please try again later.", 502);
      }
    }
  }

  return Response.json({ ok: true });
};
