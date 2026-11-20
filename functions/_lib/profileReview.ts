import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from './auth';
import type { getDb } from './db';
import { user } from './db/schema';
import { constantTimeEqual, hmacSign } from './hmac';
import { rateLimit } from './rateLimit';
import { sendEmail } from './sendEmail';
import { normalizeSocialLinks, resolveSocialLink } from '../../src/utils/socialPlatforms';

/**
 * Post-publication review ("publish first, review after"). Profiles go live
 * immediately; the admin (ADMIN_EMAIL) gets an email whenever a handle is
 * set or changed, a profile is made public, or a public profile's text /
 * links change. The email links to a confirmation page where one click
 * takes the profile down (see /api/admin/profile).
 */

type Db = ReturnType<typeof getDb>;

export type ReviewChange = 'handle' | 'published' | 'displayName' | 'bio' | 'socialLinks';

/** Review links stay valid for 30 days. */
const ADMIN_LINK_TTL_MS = 30 * 24 * 60 * 60_000;
/** Cap per user per day so one account can't flood the admin inbox. */
const NOTIFY_PER_USER_PER_DAY = 30;

export async function makeAdminProfileToken(secret: string, userId: string): Promise<string> {
  const exp = Math.floor(Date.now() + ADMIN_LINK_TTL_MS).toString(36);
  const sig = await hmacSign(secret, `profile-admin:${userId}:${exp}`);
  return `${exp}.${sig}`;
}

export async function verifyAdminProfileToken(
  secret: string,
  userId: string,
  token: string,
): Promise<boolean> {
  const dot = token.indexOf('.');
  if (!userId || dot <= 0 || dot === token.length - 1) return false;
  const expRaw = token.slice(0, dot);
  const expiresAt = parseInt(expRaw, 36);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return false;
  const expected = await hmacSign(secret, `profile-admin:${userId}:${expRaw}`);
  return constantTimeEqual(expected, token.slice(dot + 1));
}

export function adminProfileUrl(origin: string, userId: string, token: string): string {
  return `${origin}/api/admin/profile?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CHANGE_LABEL: Record<ReviewChange, string> = {
  handle: 'handle set / changed',
  published: 'profile made public',
  displayName: 'display name changed',
  bio: 'bio changed',
  socialLinks: 'social links changed',
};

export interface ReviewSnapshot {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  socialLinks: string | null;
  profilePublic: boolean;
  profileSuspendedAt: Date | null;
}

export async function loadReviewSnapshot(db: Db, userId: string): Promise<ReviewSnapshot | null> {
  const [row] = await db
    .select({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      socialLinks: user.socialLinks,
      profilePublic: user.profilePublic,
      profileSuspendedAt: user.profileSuspendedAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
}

/** The profile fields as an HTML block — shared by the email and the admin page. */
export function renderProfileFacts(p: ReviewSnapshot, origin: string): string {
  const links = normalizeSocialLinks(p.socialLinks ?? '[]')
    .map(resolveSocialLink)
    .filter((l) => l !== null)
    .map((l) => `${esc(l.name)}: <a href="${esc(l.url)}">${esc(l.display)}</a>`)
    .join('<br>');
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#7a6a60;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${v}</td></tr>`;
  const handle = p.username
    ? `<a href="${origin}/${encodeURIComponent(p.username)}">@${esc(p.username)}</a>`
    : '<em>none</em>';
  const status = p.profileSuspendedAt
    ? '<strong style="color:#b3261e">suspended</strong>'
    : p.profilePublic
      ? '<strong style="color:#4d7c0f">public</strong>'
      : 'private';
  return `<table style="border-collapse:collapse;font-size:14px;color:#2c1810">
${row('Handle', handle)}
${row('Status', status)}
${row('Display name', p.displayName ? esc(p.displayName) : '<em>—</em>')}
${row('Bio', p.bio ? esc(p.bio) : '<em>—</em>')}
${row('Social links', links || '<em>—</em>')}
${row('Account', esc(p.email))}
</table>`;
}

/**
 * Email the admin about a profile change. Best-effort and silent when
 * ADMIN_EMAIL / Resend isn't configured; never throws (callers run it via
 * waitUntil after the user's save has already succeeded).
 */
export async function notifyProfileReview(
  env: AuthEnv,
  db: Db,
  request: Request,
  waitUntil: (p: Promise<unknown>) => void,
  userId: string,
  changes: readonly ReviewChange[],
): Promise<void> {
  if (changes.length === 0 || !env.ADMIN_EMAIL || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return;
  }
  try {
    const limit = await rateLimit(
      request,
      { waitUntil },
      { bucket: 'profile-review', limit: NOTIFY_PER_USER_PER_DAY, windowSec: 86_400, keyOverride: userId },
    );
    if (!limit.ok) {
      console.warn('[profile-review] daily notification cap hit', { userId });
      return;
    }
    const p = await loadReviewSnapshot(db, userId);
    if (!p) return;
    const origin = 'https://acoffee.com';
    const token = await makeAdminProfileToken(env.AUTH_SECRET, userId);
    const reviewUrl = adminProfileUrl(origin, userId, token);
    const what = changes.map((c) => CHANGE_LABEL[c]).join(', ');
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px">
<h2 style="font-size:18px;color:#2c1810;margin:0 0 4px">Profile review: ${p.username ? '@' + esc(p.username) : esc(p.email)}</h2>
<p style="margin:0 0 16px;color:#7a6a60;font-size:14px">${esc(what)}</p>
${renderProfileFacts(p, origin)}
<p style="margin:20px 0 0">
${p.username ? `<a href="${origin}/${encodeURIComponent(p.username)}" style="display:inline-block;padding:8px 16px;border:1px solid #c9b8a8;border-radius:999px;color:#2c1810;text-decoration:none;margin-right:8px">View profile</a>` : ''}
<a href="${reviewUrl}" style="display:inline-block;padding:8px 16px;background:#b3261e;border-radius:999px;color:#fff;text-decoration:none">Review / take down</a>
</p>
<p style="margin:16px 0 0;color:#9a8a80;font-size:12px">The review link opens a confirmation page; nothing changes until you press the button there. Valid for 30 days.</p>
</div>`;
    await sendEmail(new Resend(env.RESEND_API_KEY), {
      from: env.RESEND_FROM_EMAIL,
      to: env.ADMIN_EMAIL,
      subject: `[ACoffee review] ${p.username ? '@' + p.username : p.email} — ${what}`,
      html,
    });
  } catch (e) {
    console.error('[profile-review] notify failed', {
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
