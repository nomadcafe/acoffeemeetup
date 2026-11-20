/**
 * Allowlisted social platforms for public profile links. Shared verbatim by
 * the client (AccountPage editor, PublicProfilePage) and the server
 * (account PATCH validation, profile read). Pure — no imports.
 *
 * Users never supply a URL. They pick a platform and give a handle (or
 * paste their profile link, from which the handle is extracted); the URL is
 * always rebuilt from the platform's fixed template. That keeps profiles
 * from being used to host arbitrary / phishing / shortener links under our
 * domain, and there's no free-text label to carry spam either.
 */

export type SocialPlatformId =
  | 'x'
  | 'instagram'
  | 'threads'
  | 'facebook'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'github'
  | 'bluesky'
  | 'xiaohongshu'
  | 'weibo'
  | 'bilibili'
  | 'douyin';

interface PlatformDef {
  id: SocialPlatformId;
  /** Brand name as shown on the profile (brand names aren't translated). */
  name: string;
  /** Example shown as the input placeholder. */
  example: string;
  /** Valid handle / id, after stripping a leading "@". */
  handle: RegExp;
  /** Hosts a pasted profile URL may come from (www./m. stripped first). */
  hosts: readonly string[];
  /** Pull the handle out of a pasted URL's pathname. */
  fromPath: RegExp;
  /** Canonical profile URL for a validated handle. */
  url: (h: string) => string;
  /** How the handle is displayed (e.g. with a leading @). */
  display: (h: string) => string;
}

const at = (h: string) => `@${h}`;
const plain = (h: string) => h;

export const SOCIAL_PLATFORMS: readonly PlatformDef[] = [
  {
    id: 'x',
    name: 'X',
    example: '@yourname',
    handle: /^[A-Za-z0-9_]{1,15}$/,
    hosts: ['x.com', 'twitter.com'],
    fromPath: /^\/([^/?#]+)/,
    url: (h) => `https://x.com/${h}`,
    display: at,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    example: '@yourname',
    handle: /^[A-Za-z0-9._]{1,30}$/,
    hosts: ['instagram.com'],
    fromPath: /^\/([^/?#]+)/,
    url: (h) => `https://www.instagram.com/${h}/`,
    display: at,
  },
  {
    id: 'threads',
    name: 'Threads',
    example: '@yourname',
    handle: /^[A-Za-z0-9._]{1,30}$/,
    hosts: ['threads.net', 'threads.com'],
    fromPath: /^\/@([^/?#]+)/,
    url: (h) => `https://www.threads.net/@${h}`,
    display: at,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    example: 'yourname',
    handle: /^[A-Za-z0-9.]{5,50}$/,
    hosts: ['facebook.com', 'fb.com'],
    fromPath: /^\/([^/?#]+)/,
    url: (h) => `https://www.facebook.com/${h}`,
    display: plain,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    example: 'your-name',
    handle: /^[A-Za-z0-9-]{3,100}$/,
    hosts: ['linkedin.com'],
    fromPath: /^\/in\/([^/?#]+)/,
    url: (h) => `https://www.linkedin.com/in/${h}`,
    display: plain,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    example: '@yourchannel',
    handle: /^[A-Za-z0-9._-]{3,30}$/,
    hosts: ['youtube.com'],
    fromPath: /^\/@([^/?#]+)/,
    url: (h) => `https://www.youtube.com/@${h}`,
    display: at,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    example: '@yourname',
    handle: /^[A-Za-z0-9._]{2,24}$/,
    hosts: ['tiktok.com'],
    fromPath: /^\/@([^/?#]+)/,
    url: (h) => `https://www.tiktok.com/@${h}`,
    display: at,
  },
  {
    id: 'github',
    name: 'GitHub',
    example: 'yourname',
    handle: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/,
    hosts: ['github.com'],
    fromPath: /^\/([^/?#]+)/,
    url: (h) => `https://github.com/${h}`,
    display: plain,
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    example: 'yourname.bsky.social',
    handle: /^(?=.{3,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/,
    hosts: ['bsky.app'],
    fromPath: /^\/profile\/([^/?#]+)/,
    url: (h) => `https://bsky.app/profile/${h}`,
    display: at,
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    example: 'https://www.xiaohongshu.com/user/profile/…',
    handle: /^[0-9a-f]{24}$/,
    hosts: ['xiaohongshu.com'],
    fromPath: /^\/user\/profile\/([0-9a-f]{24})/,
    url: (h) => `https://www.xiaohongshu.com/user/profile/${h}`,
    display: () => '小红书',
  },
  {
    id: 'weibo',
    name: '微博',
    example: 'https://weibo.com/u/1234567890',
    handle: /^\d{5,12}$/,
    hosts: ['weibo.com', 'weibo.cn'],
    fromPath: /^\/(?:u\/)?(\d{5,12})(?:[/?#]|$)/,
    url: (h) => `https://weibo.com/u/${h}`,
    display: () => '微博',
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    example: 'https://space.bilibili.com/12345678',
    handle: /^\d{1,12}$/,
    hosts: ['space.bilibili.com'],
    fromPath: /^\/(\d{1,12})(?:[/?#]|$)/,
    url: (h) => `https://space.bilibili.com/${h}`,
    display: (h) => `UID ${h}`,
  },
  {
    id: 'douyin',
    name: '抖音',
    example: 'https://www.douyin.com/user/…',
    handle: /^[A-Za-z0-9_-]{10,100}$/,
    hosts: ['douyin.com'],
    fromPath: /^\/user\/([A-Za-z0-9_-]{10,100})/,
    url: (h) => `https://www.douyin.com/user/${h}`,
    display: () => '抖音',
  },
];

const BY_ID = new Map(SOCIAL_PLATFORMS.map((p) => [p.id, p] as const));

/** Path segments that look like a handle but are site sections. */
const NOT_A_HANDLE = new Set([
  'home', 'explore', 'search', 'settings', 'login', 'signup', 'share', 'intent',
  'hashtag', 'i', 'p', 'reel', 'reels', 'stories', 'watch', 'channel', 'c', 'user',
  'groups', 'pages', 'events', 'marketplace', 'profile.php', 'orgs', 'about',
]);

export const SOCIAL_LINKS_MAX = 5;

export function getPlatform(id: string): PlatformDef | undefined {
  return BY_ID.get(id as SocialPlatformId);
}

/**
 * Turn user input (a bare handle, "@handle", or a pasted profile URL) into a
 * validated handle for `platformId`, or null if it doesn't fit.
 */
export function parseSocialHandle(platformId: string, input: string): string | null {
  const p = getPlatform(platformId);
  if (!p) return null;
  let v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /^(www\.|m\.)/i.test(v) || p.hosts.some((h) => v.toLowerCase().startsWith(h))) {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      return null;
    }
    const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    if (!p.hosts.includes(host)) return null;
    const m = p.fromPath.exec(u.pathname);
    if (!m) return null;
    v = decodeURIComponent(m[1]);
  }
  v = v.replace(/^@/, '');
  if (p.id === 'bluesky') v = v.toLowerCase();
  if (NOT_A_HANDLE.has(v.toLowerCase())) return null;
  return p.handle.test(v) ? v : null;
}

export interface SocialLinkValue {
  platform: SocialPlatformId;
  handle: string;
}

export interface ResolvedSocialLink extends SocialLinkValue {
  url: string;
  name: string;
  display: string;
}

export function resolveSocialLink(l: SocialLinkValue): ResolvedSocialLink | null {
  const p = getPlatform(l.platform);
  if (!p || !p.handle.test(l.handle)) return null;
  return { ...l, url: p.url(l.handle), name: p.name, display: p.display(l.handle) };
}

/**
 * Read the stored JSON (new `{platform, handle}` rows, or legacy
 * `{label, url}` rows from before the allowlist). Legacy URLs are kept only
 * when they map onto an allowlisted platform; anything else is dropped.
 * Deduped by platform, capped at SOCIAL_LINKS_MAX.
 */
export function normalizeSocialLinks(raw: unknown): SocialLinkValue[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: SocialLinkValue[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    let value: SocialLinkValue | null = null;
    if (typeof o.platform === 'string' && typeof o.handle === 'string') {
      const h = parseSocialHandle(o.platform, o.handle);
      if (h) value = { platform: o.platform as SocialPlatformId, handle: h };
    } else if (typeof o.url === 'string') {
      for (const p of SOCIAL_PLATFORMS) {
        const h = parseSocialHandle(p.id, o.url);
        if (h) {
          value = { platform: p.id, handle: h };
          break;
        }
      }
    }
    if (!value || seen.has(value.platform)) continue;
    seen.add(value.platform);
    out.push(value);
    if (out.length >= SOCIAL_LINKS_MAX) break;
  }
  return out;
}
