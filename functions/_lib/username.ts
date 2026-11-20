import { and, eq, ne } from 'drizzle-orm';
import { user } from './db/schema';
import { getDb, type DbEnv } from './db';

/**
 * Lowercase letters/digits/`_`/`-`, 3–30 chars, must start with a letter so a
 * pure-numeric `acoffee.com/123` doesn't end up looking like a placeholder.
 * The user-facing AccountPage form tightens this to 4+ chars so super-short
 * slugs are reserved; the server stays permissive so existing 3-char names
 * keep working and so we can hand-pick short slugs in D1 later.
 * Reserved words (account, passport, signin, etc.) collide with our own
 * routes — block them at write time so the future `/yourname` surface
 * stays safe.
 */
export const USERNAME_REGEX = /^[a-z][a-z0-9_-]{2,29}$/;

/**
 * Names blocked from public registration. Two reasons to add a name here:
 *   1. Route collision (account, passport, signin, …) — these would
 *      shadow our own pages at acoffee.com/<reserved>.
 *   2. Brand / marketing reservation (cafe, cake, free, money, …) —
 *      generic high-value slugs we want to keep for partnerships,
 *      Pro-tier upgrades, or our own future surfaces.
 *
 *   3. Impersonation — official / support / security / acoffee etc., so
 *      nobody can stand up `acoffee.com/acoffee-official`-style pages
 *      that read as us. Exact match, plus any slug containing "acoffee"
 *      (see validateUsername).
 *
 * The AccountPage form rejects names under 4 chars, but the API accepts
 * 3, so the few 3-char route / brand slugs (api, www, pro…) are listed
 * too. Keep the list alphabetical.
 *
 * Users hitting a reserved name see a "this slug is reserved — please
 * contact us if you need it" message rather than a flat "taken" error,
 * so the gating reads as intentional.
 */
export const RESERVED_USERNAMES = new Set([
  'about',
  'abuse',
  'account',
  'acoffee',
  'acoffeemeetup',
  'admin',
  'administrator',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'blog',
  'blue',
  'booking',
  'bookings',
  'cafe',
  'cafes',
  'cake',
  'callback',
  'cancel',
  'careers',
  'cash',
  'casino',
  'cdn',
  'chain',
  'coffee',
  'coffeemeetup',
  'confirm',
  'contact',
  'cron',
  'dashboard',
  'dev',
  'docs',
  'domain',
  'email',
  'explore',
  'faq',
  'founder',
  'free',
  'game',
  'hello',
  'help',
  'hostmaster',
  'inbox',
  'info',
  'invite',
  'jobs',
  'legal',
  'link',
  'login',
  'logout',
  'love',
  'mail',
  'manifest',
  'market',
  'meetup',
  'messages',
  'mod',
  'moderator',
  'money',
  'news',
  'no-reply',
  'noreply',
  'notifications',
  'oauth',
  'official',
  'ops',
  'owner',
  'partners',
  'passport',
  'payment',
  'play',
  'postmaster',
  'press',
  'pricing',
  'privacy',
  'pro',
  'profile',
  'profiles',
  'proposal',
  'proposals',
  'report',
  'robots',
  'root',
  'search',
  'security',
  'settings',
  'setup',
  'share',
  'shop',
  'show',
  'signin',
  'signout',
  'signup',
  'sitemap',
  'space',
  'staff',
  'static',
  'status',
  'support',
  'system',
  'team',
  'terms',
  'tour',
  'travel',
  'updatelog',
  'updates',
  'user',
  'users',
  'verified',
  'verify',
  'webmaster',
  'white',
  'world',
  'www',
]);

export type UsernameValidation =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'reserved' };

export function validateUsername(value: string): UsernameValidation {
  if (!USERNAME_REGEX.test(value)) return { ok: false, reason: 'invalid' };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, reason: 'reserved' };
  // Any slug carrying our brand (acoffee-support, the-acoffee-team…) would
  // read as official, so the brand is blocked as a substring, not just exact.
  if (value.includes('acoffee')) return { ok: false, reason: 'reserved' };
  return { ok: true };
}

export type AvailabilityCheck =
  | { available: true }
  | { available: false; reason: 'invalid' | 'reserved' | 'taken' };

/**
 * Server-side availability check for the candidate `value`. The current
 * user's own existing name is treated as available (so they can re-save
 * unchanged without spurious failure).
 */
export async function checkUsernameAvailability(
  env: DbEnv,
  value: string,
  selfUserId: string,
): Promise<AvailabilityCheck> {
  const v = validateUsername(value);
  if (!v.ok) return { available: false, reason: v.reason };

  const db = getDb(env);
  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, value), ne(user.id, selfUserId)));
  if (taken) return { available: false, reason: 'taken' };

  return { available: true };
}
