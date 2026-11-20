/**
 * Rules for the free-text profile fields (display name, bio). Shared by
 * the client (inline validation in the Account editor) and the server
 * (validation on save + a defensive filter on every read). Pure — no
 * imports.
 *
 * These fields are shown on the public profile, in share previews, on café
 * cards in search results and in booking emails, all under our domain. They
 * stay plain text (never auto-linked), and must not carry:
 *   - links or domain names, including obfuscated ones (scam[.]com,
 *     "scam dot com", fullwidth ｓｃａｍ．ｃｏｍ),
 *   - email addresses or long phone numbers (off-platform contact bait),
 *   - in the display name, words that read as us / staff (ACoffee,
 *     official, support, 客服, 公式 …).
 */

export type ProfileTextIssue = 'link' | 'contact' | 'impersonation';

/** Zero-width, bidi-override and other invisible / control characters. */
const INVISIBLE =
  // Matching control / combining / variation-selector chars is the point here.
  // eslint-disable-next-line no-control-regex, no-misleading-character-class
  /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;

/**
 * Canonical form we store and check: NFKC (folds fullwidth / stylised
 * letters to ASCII), invisible characters removed, whitespace collapsed.
 */
export function cleanProfileText(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/* Common + commonly-abused TLDs. A bare "word.tld" with one of these reads
 * as a domain; we don't try to match every TLD (that would flag ordinary
 * text like "Node.js"). */
const TLDS = [
  'com', 'net', 'org', 'info', 'biz', 'io', 'co', 'me', 'app', 'dev', 'ai', 'gg', 'tv', 'cc',
  'ly', 'to', 'xyz', 'top', 'site', 'online', 'store', 'shop', 'club', 'live', 'link', 'click',
  'vip', 'win', 'bet', 'icu', 'buzz', 'fun', 'life', 'world', 'today', 'page', 'pro', 'one',
  'cn', 'jp', 'hk', 'tw', 'kr', 'sg', 'uk', 'us', 'ru', 'de', 'fr', 'in', 'tk', 'ml', 'ga',
  'cf', 'gq', 'pw', 'ws', 'su',
].join('|');

const LINK_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\//i, // any scheme://
  /\bwww\s*[.。]/i,
  // word . tld — with real or obfuscated dots: . 。 [.] (.) {.} " dot "
  new RegExp(
    `[a-z0-9][a-z0-9-]*\\s*(?:\\.|。|\\[\\s*\\.?\\s*\\]|\\(\\s*\\.?\\s*\\)|\\{\\s*\\.?\\s*\\}|\\s(?:dot)\\s|\\s?(?:點|点)\\s?)\\s*(?:${TLDS})(?![a-z0-9])`,
    'i',
  ),
  /\b(?:t|wa)\.me\b/i,
];

const CONTACT_PATTERNS: readonly RegExp[] = [
  /[a-z0-9._%+-]+\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\))\s*[a-z0-9-]+\s*(?:\.|\[\s*dot\s*\]|\s+dot\s+)\s*[a-z]{2,}/i,
  // 9+ digits, allowing spaces / dashes / dots / parentheses between them
  /(?:\+?\d[\s\-.()]*){9,}/,
];

/* English role words: whole words only, so "Badminton lover" or
 * "Staffordshire" aren't caught by "admin" / "staff". */
const IMPERSONATION_WORDS =
  /\b(?:official|admins?|administrators?|moderators?|mods|support|staff|helpdesk|customer\s*service|verified|security|team\s*acoffee)\b/i;

/* Brand + CJK terms: matched as substrings of the name with spaces /
 * punctuation removed and lowercased (CJK has no word spaces, and this also
 * folds "A Coffee", "a-coffee", "ＡＣｏｆｆｅｅ" into "acoffee"). */
const IMPERSONATION_TERMS: readonly string[] = [
  'acoffee',
  '官方', '客服', '管理员', '管理員', '工作人员', '认证', '認證',
  '公式', '運営', 'サポート', '管理者', 'スタッフ',
];

function squash(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

/** First problem found in `text` (already cleaned or not), or null. */
export function profileTextIssue(
  text: string,
  field: 'displayName' | 'bio',
): ProfileTextIssue | null {
  const t = cleanProfileText(text);
  if (!t) return null;
  // Contact first: an email address also contains a domain.
  if (CONTACT_PATTERNS.some((re) => re.test(t))) return 'contact';
  if (LINK_PATTERNS.some((re) => re.test(t))) return 'link';
  if (field === 'displayName') {
    if (IMPERSONATION_WORDS.test(t)) return 'impersonation';
    const sq = squash(t);
    if (IMPERSONATION_TERMS.some((w) => sq.includes(w))) return 'impersonation';
  }
  return null;
}

/**
 * Read-side filter: the cleaned value, or null when it breaks the rules
 * (legacy rows saved before validation, or anything that slipped past).
 * Callers fall back to `@username` for names and hide the bio.
 */
export function safeProfileText(
  raw: string | null | undefined,
  field: 'displayName' | 'bio',
): string | null {
  if (!raw) return null;
  const t = cleanProfileText(raw);
  if (!t || profileTextIssue(t, field)) return null;
  return t;
}
