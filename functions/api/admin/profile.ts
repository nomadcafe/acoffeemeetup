import { eq } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import {
  loadReviewSnapshot,
  renderProfileFacts,
  verifyAdminProfileToken,
} from '../../_lib/profileReview';

/**
 * Admin review page linked from profile-review emails. Authorised by the
 * signed, user-scoped, expiring token in the link — no admin login.
 *
 * GET only renders the page; the change happens on POST from its button.
 * Mail providers (Gmail, Outlook Safe Links…) pre-fetch links in emails, so
 * a GET that took a profile down would fire without anyone clicking.
 *
 *   suspend → profile_public=false + profile_suspended_at=now. Every public
 *             read already requires profile_public, so the profile, share
 *             preview, booking form and café attributions all disappear.
 *   restore → clears the suspension and makes the profile public again.
 */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title></head>
<body style="margin:0;background:#f7f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2c1810">
<main style="max-width:560px;margin:40px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e6dcd2">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${body}
</main></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    },
  );
}

const BTN =
  'padding:10px 18px;border:0;border-radius:999px;font:inherit;font-weight:600;cursor:pointer;color:#fff';

function actionForm(userId: string, token: string, action: 'suspend' | 'restore'): string {
  const label = action === 'suspend' ? 'Take profile down' : 'Restore profile';
  const bg = action === 'suspend' ? '#b3261e' : '#4d7c0f';
  return `<form method="post" style="margin-top:20px">
<input type="hidden" name="u" value="${esc(userId)}">
<input type="hidden" name="t" value="${esc(token)}">
<input type="hidden" name="action" value="${action}">
<button type="submit" style="${BTN};background:${bg}">${label}</button>
</form>`;
}

async function authorise(env: AuthEnv, userId: string | null, token: string | null) {
  if (!userId || !token) return false;
  return verifyAdminProfileToken(env.AUTH_SECRET, userId, token);
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u');
  const token = url.searchParams.get('t');
  if (!(await authorise(env, userId, token))) {
    return page('Link invalid or expired', '<p>Open the latest review email for a fresh link.</p>', 403);
  }
  const db = getDb(env);
  const p = await loadReviewSnapshot(db, userId!);
  if (!p) return page('Account not found', '<p>This account no longer exists.</p>', 404);
  return page(
    p.username ? `Review @${p.username}` : 'Review profile',
    renderProfileFacts(p, url.origin) +
      actionForm(userId!, token!, p.profileSuspendedAt ? 'restore' : 'suspend'),
  );
};

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const form = await request.formData().catch(() => null);
  const userId = (form?.get('u') as string | null) ?? null;
  const token = (form?.get('t') as string | null) ?? null;
  const action = form?.get('action');
  if (!(await authorise(env, userId, token)) || (action !== 'suspend' && action !== 'restore')) {
    return page('Link invalid or expired', '<p>Open the latest review email for a fresh link.</p>', 403);
  }
  const db = getDb(env);
  if (action === 'suspend') {
    await db
      .update(user)
      .set({ profilePublic: false, profileSuspendedAt: new Date(), updatedAt: new Date() })
      .where(eq(user.id, userId!));
    console.warn('[admin] profile suspended', { userId });
  } else {
    const current = await loadReviewSnapshot(db, userId!);
    await db
      .update(user)
      .set({ profilePublic: !!current?.username, profileSuspendedAt: null, updatedAt: new Date() })
      .where(eq(user.id, userId!));
    console.warn('[admin] profile restored', { userId });
  }
  const p = await loadReviewSnapshot(db, userId!);
  if (!p) return page('Account not found', '<p>This account no longer exists.</p>', 404);
  return page(
    action === 'suspend' ? 'Profile taken down' : 'Profile restored',
    renderProfileFacts(p, new URL(request.url).origin) +
      actionForm(userId!, token!, action === 'suspend' ? 'restore' : 'suspend'),
  );
};
