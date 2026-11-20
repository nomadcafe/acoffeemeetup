import { and, eq } from 'drizzle-orm';
import type { AuthEnv } from './_lib/auth';
import { getDb } from './_lib/db';
import { user, visitedShops } from './_lib/db/schema';
import { RESERVED_USERNAMES } from './_lib/username';
import { rateLimit } from './_lib/rateLimit';
import {
  PREVIEW_COPY,
  formatPreviewTime,
  loadProposalPreview,
  type PreviewLocale,
} from './_lib/proposalPreview';
import { safeProfileText } from '../src/utils/profileText';

/**
 * Root middleware that rewrites the SPA's static index.html for two
 * surfaces that need SEO / link-preview metadata before the React app
 * has a chance to update it client-side:
 *
 *   1. Public profile pages — `acoffee.com/<username>` and
 *      `acoffee.com/<locale>/<username>`. Without injection every
 *      shared profile would show the generic English site preview on
 *      iMessage / Twitter / Slack / WhatsApp.
 *
 *   2. Localized homepages — `/`, `/en/`, `/ja/`, `/zh/`. The static
 *      <title> / og:title / og:description / og:locale / canonical /
 *      <html lang> are all English. When a Chinese or Japanese user
 *      shares `acoffee.com/zh/`, the link-preview bot fetches the raw
 *      HTML (no JS execution), so they see English copy. The
 *      I18nContext fixes this in-browser but the bots never get there.
 *
 * Skip rules:
 *   - non-GET methods
 *   - non-HTML accept headers (assets, JSON fetches)
 *   - /api/ /_* /assets/ /sw.js /manifest.webmanifest
 *   - paths with extensions (.png, .ico, …)
 *   - reserved words (account, passport, updates, …) — they're SPA
 *     routes that don't need bespoke OG yet, and bookings are auth-
 *     gated so SEO doesn't apply
 */

const USERNAME_RE = /^(?:\/(en|ja|zh))?\/([a-z][a-z0-9_-]{2,29})\/?$/;
/** `/`, `/en`, `/en/`, `/ja`, `/ja/`, `/zh`, `/zh/`. */
const HOME_PATH_RE = /^\/(?:(en|ja|zh)\/?)?$/;

type Locale = 'en' | 'ja' | 'zh';

/**
 * Per-locale SEO copy. Mirrors the seo.* keys in src/i18n/locales/*.ts
 * but lives here because Pages Functions can't import from the SPA
 * source tree at build time. Keep in sync when those keys change —
 * grep for `seo.ogTitle` in this file before editing the i18n locales.
 */
interface PageCopy {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

const SEO_COPY: Record<Locale, PageCopy & {
  ogLocale: string;
  htmlLang: string;
  ogImageAlt: string;
}> = {
  en: {
    title: 'Meet Halfway — Find a Café Between Two Addresses | ACoffee',
    description:
      "Enter two or three addresses and ACoffee finds a well-rated café that's fair for everyone — by real travel time, not just the map midpoint. Free, no sign-up.",
    ogTitle: 'Meet halfway, over great coffee — ACoffee',
    ogDescription:
      "Enter two addresses. ACoffee picks a well-rated café that's fair for both of you — by real travel time. Free, no sign-up.",
    ogLocale: 'en_US',
    htmlLang: 'en',
    ogImageAlt: 'ACoffee — Meet halfway, over great coffee.',
  },
  ja: {
    title: '中間地点のカフェ検索｜ふたりの真ん中で会う — ACoffee',
    description:
      '2〜3人の住所を入れるだけで、全員に公平な評価の高いカフェを実際の移動時間で選びます。地図上の中間点だけではありません。無料・登録不要。',
    ogTitle: 'ふたりの真ん中で、いいコーヒーを。— ACoffee',
    ogDescription: '住所をふたつ入れるだけ。どちらにも公平で、評価の高いカフェを選びます。無料・登録不要。',
    ogLocale: 'ja_JP',
    htmlLang: 'ja',
    ogImageAlt: 'ACoffee — ふたりの真ん中で、いいコーヒーを。',
  },
  zh: {
    title: '两地中间点咖啡馆查找｜在两人中间见面 — ACoffee',
    description:
      '输入两到三个地址，ACoffee 按实际通勤时间，挑一家评分高、对每个人都公平的咖啡馆，不只是地图中点。免费，无需注册。',
    ogTitle: '在两人中间，喝一杯好咖啡。— ACoffee',
    ogDescription: '输入两个地址，ACoffee 帮你们挑一家评分高、对双方都公平的咖啡馆。免费，无需注册。',
    ogLocale: 'zh_CN',
    htmlLang: 'zh-CN',
    ogImageAlt: 'ACoffee — 在两人中间，喝一杯好咖啡。',
  },
};

/** Indexable secondary SPA pages (all listed in sitemap.xml). Without
 *  this they shipped the homepage's English title and a canonical
 *  pointing at `/`, which tells Google they're duplicates of the home. */
type StaticPage = 'updatelog' | 'passport';
const PAGE_COPY: Record<StaticPage, Record<Locale, PageCopy>> = {
  updatelog: {
    en: {
      title: 'Update log · ACoffee',
      description: "What's new in ACoffee — features, fixes and design changes, newest first.",
      ogTitle: 'Update log · ACoffee',
      ogDescription: "What's new in ACoffee — features, fixes and design changes.",
    },
    ja: {
      title: '更新ログ · ACoffee',
      description: 'ACoffee の新機能・改善・デザイン変更の記録（新しい順）。',
      ogTitle: '更新ログ · ACoffee',
      ogDescription: 'ACoffee の新機能・改善・デザイン変更の記録。',
    },
    zh: {
      title: '更新日志 · ACoffee',
      description: 'ACoffee 的新功能、修复和界面改动记录，按时间倒序。',
      ogTitle: '更新日志 · ACoffee',
      ogDescription: 'ACoffee 的新功能、修复和界面改动记录。',
    },
  },
  passport: {
    en: {
      title: 'Coffee Passport — log the cafés you visit · ACoffee',
      description:
        'Stamp every café you visit, add notes and ratings, and see your coffee map and streak. Free, works without an account.',
      ogTitle: 'Coffee Passport · ACoffee',
      ogDescription: 'Stamp every café you visit and see your coffee map and streak.',
    },
    ja: {
      title: 'コーヒーパスポート — 行ったカフェを記録 · ACoffee',
      description:
        '訪れたカフェにスタンプを押して、メモや評価、コーヒーマップや連続記録を残せます。無料・アカウントなしでも使えます。',
      ogTitle: 'コーヒーパスポート · ACoffee',
      ogDescription: '訪れたカフェにスタンプを押して、コーヒーマップと連続記録を残そう。',
    },
    zh: {
      title: '咖啡护照 — 记录你去过的咖啡馆 · ACoffee',
      description: '给去过的每家咖啡馆盖章，写笔记、打分，查看你的咖啡地图和连续打卡。免费，不登录也能用。',
      ogTitle: '咖啡护照 · ACoffee',
      ogDescription: '给去过的每家咖啡馆盖章，查看你的咖啡地图和连续打卡。',
    },
  },
};
/** Proposal share links: `/p/<uuid>`, optionally locale-prefixed (the
 *  sender's language, so the preview reads in it). */
const PROPOSAL_PATH_RE = /^\/(?:(en|ja|zh)\/)?p\/([0-9a-f-]{36})\/?$/i;
const PAGE_PATH_RE = /^\/(?:(en|ja|zh)\/)?(updatelog|passport)\/?$/;
const LOCALES: Locale[] = ['en', 'ja', 'zh'];

const SKIP_PREFIXES = ['/api/', '/assets/', '/_'];
const SKIP_PATHS = new Set([
  '/sw.js',
  '/registerSW.js',
  '/manifest.webmanifest',
  '/robots.txt',
  '/favicon.ico',
  '/logo.png',
]);

interface ProfileForOg {
  username: string;
  displayName: string | null;
  bio: string | null;
  cups: number;
  shops: number;
}

async function fetchProfileForOg(env: AuthEnv, username: string): Promise<ProfileForOg | null> {
  const db = getDb(env);
  const [owner] = await db
    .select({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      profilePublic: user.profilePublic,
    })
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));
  if (!owner) return null;

  // Aggregate cup + shop counts. Quick query, no full visits parsing —
  // OG just needs round numbers, not the rich payload the JSON API ships.
  const rows = await db
    .select({ visits: visitedShops.visits })
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, owner.id), eq(visitedShops.deleted, false)));
  let cups = 0;
  let shops = 0;
  for (const r of rows) {
    let visitsArr: unknown;
    try {
      visitsArr = JSON.parse(r.visits);
    } catch {
      continue;
    }
    if (!Array.isArray(visitsArr) || visitsArr.length === 0) continue;
    shops++;
    cups += visitsArr.length;
  }

  return {
    username: owner.username ?? username,
    displayName: safeProfileText(owner.displayName, 'displayName'),
    bio: safeProfileText(owner.bio, 'bio'),
    cups,
    shops,
  };
}

interface OgValues {
  title: string;
  description: string;
  url: string;
  image: string;
}

function buildOgValues(profile: ProfileForOg, requestUrl: URL): OgValues {
  const display = profile.displayName?.trim() || `@${profile.username}`;
  const title = `${display} on ACoffee ☕`;
  const description = profile.bio?.trim()
    ? profile.bio
    : `${profile.cups} cups across ${profile.shops} cafés.`;
  return {
    title,
    description,
    url: `${requestUrl.origin}/${profile.username}`,
    image: `${requestUrl.origin}/api/og/${profile.username}`,
  };
}

class MetaTagSetter {
  constructor(
    private readonly key: 'name' | 'property',
    private readonly value: string,
    private readonly content: string,
  ) {}
  element(el: Element) {
    if (el.getAttribute(this.key) === this.value) {
      el.setAttribute('content', this.content);
    }
  }
}

class TitleSetter {
  constructor(private readonly title: string) {}
  element(el: Element) {
    // setInnerContent escapes text itself; pre-escaping showed "&amp;amp;".
    el.setInnerContent(this.title);
  }
}

class HtmlLangSetter {
  constructor(private readonly lang: string) {}
  element(el: Element) {
    el.setAttribute('lang', this.lang);
  }
}

/** Points the static hreflang links at this page's per-locale URLs (or
 *  drops them when `hrefs` is null — e.g. profiles, which have one
 *  canonical URL regardless of UI language). */
class AlternateSetter {
  constructor(private readonly hrefs: Record<string, string> | null) {}
  element(el: Element) {
    if (el.getAttribute('rel') !== 'alternate') return;
    const lang = el.getAttribute('hreflang');
    if (!lang) return;
    if (!this.hrefs) {
      el.remove();
      return;
    }
    const href = this.hrefs[lang];
    if (href) el.setAttribute('href', href);
  }
}

function alternatesFor(origin: string, basePath: string): Record<string, string> {
  const hrefs: Record<string, string> = {};
  for (const l of LOCALES) hrefs[l === 'zh' ? 'zh-CN' : l] = `${origin}/${l}${basePath}`;
  hrefs['x-default'] = `${origin}/en${basePath}`;
  return hrefs;
}

/** Shared head rewrite for the home and static pages. */
function localizedPageRewriter(
  locale: Locale,
  copy: PageCopy,
  canonicalHref: string,
  alternates: Record<string, string>,
  ogImage: string,
): HTMLRewriter {
  const base = SEO_COPY[locale];
  return new HTMLRewriter()
    .on('html', new HtmlLangSetter(base.htmlLang))
    .on('title', new TitleSetter(copy.title))
    .on('meta[name="description"]', new MetaTagSetter('name', 'description', copy.description))
    .on('meta[property="og:title"]', new MetaTagSetter('property', 'og:title', copy.ogTitle))
    .on('meta[property="og:description"]', new MetaTagSetter('property', 'og:description', copy.ogDescription))
    .on('meta[property="og:locale"]', new MetaTagSetter('property', 'og:locale', base.ogLocale))
    .on('meta[property="og:url"]', new MetaTagSetter('property', 'og:url', canonicalHref))
    .on('meta[property="og:image"]', new MetaTagSetter('property', 'og:image', ogImage))
    .on('meta[property="og:image:alt"]', new MetaTagSetter('property', 'og:image:alt', base.ogImageAlt))
    .on('meta[name="twitter:card"]', new MetaTagSetter('name', 'twitter:card', 'summary_large_image'))
    .on('meta[name="twitter:title"]', new MetaTagSetter('name', 'twitter:title', copy.ogTitle))
    .on('meta[name="twitter:description"]', new MetaTagSetter('name', 'twitter:description', copy.ogDescription))
    .on('meta[name="twitter:image"]', new MetaTagSetter('name', 'twitter:image', ogImage))
    .on('meta[name="twitter:image:alt"]', new MetaTagSetter('name', 'twitter:image:alt', base.ogImageAlt))
    .on('link[rel="canonical"]', new CanonicalSetter(canonicalHref))
    .on('link[rel="alternate"]', new AlternateSetter(alternates));
}

class CanonicalSetter {
  constructor(private readonly href: string) {}
  element(el: Element) {
    if (el.getAttribute('rel') === 'canonical') {
      el.setAttribute('href', this.href);
    }
  }
}

export const onRequest: PagesFunction<AuthEnv> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET') return next();
  for (const p of SKIP_PREFIXES) {
    if (url.pathname.startsWith(p)) return next();
  }
  if (SKIP_PATHS.has(url.pathname)) return next();
  // Path with a file extension (.png, .js, etc.) is definitely an asset.
  if (/\.[a-z0-9]{1,5}$/i.test(url.pathname)) return next();

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) return next();

  // Localized homepages: `/`, `/en/`, `/ja/`, `/zh/`. Match before the
  // username pattern because they would also match the more permissive
  // username regex (e.g. `/en` could be parsed as username `en`, except
  // we already reserved 'en' is too short — but be explicit).
  const homeMatch = url.pathname.match(HOME_PATH_RE);
  if (homeMatch) {
    const locale = (homeMatch[1] as Locale | undefined) ?? 'en';
    // `/` serves the same page as `/en/` (and is the hreflang x-default
    // target's twin), so it canonicalises there instead of competing.
    const canonicalHref = `${url.origin}/${locale}/`;
    const response = await next();
    const ctype = response.headers.get('content-type') ?? '';
    if (!ctype.includes('text/html')) return response;
    return localizedPageRewriter(
      locale,
      SEO_COPY[locale],
      canonicalHref,
      alternatesFor(url.origin, '/'),
      `${url.origin}/og/home-${locale}.png`,
    ).transform(response);
  }

  const pageMatch = url.pathname.match(PAGE_PATH_RE);
  if (pageMatch) {
    const locale = (pageMatch[1] as Locale | undefined) ?? 'en';
    const page = pageMatch[2] as StaticPage;
    const response = await next();
    const ctype = response.headers.get('content-type') ?? '';
    if (!ctype.includes('text/html')) return response;
    return localizedPageRewriter(
      locale,
      PAGE_COPY[page][locale],
      `${url.origin}/${locale}/${page}`,
      alternatesFor(url.origin, `/${page}`),
      `${url.origin}/og/home-${locale}.png`,
    ).transform(response);
  }

  const proposalMatch = url.pathname.match(PROPOSAL_PATH_RE);
  if (proposalMatch) {
    const locale = (proposalMatch[1] as PreviewLocale | undefined) ?? 'en';
    const id = proposalMatch[2].toLowerCase();
    // Same per-IP cap as the profile lookup: one D1 read per hit.
    const rl = await rateLimit(
      request,
      { waitUntil: context.waitUntil.bind(context) },
      { bucket: 'mw-og-lookup', limit: 60, windowSec: 600 },
    );
    const preview = rl.ok ? await loadProposalPreview(env, id).catch(() => null) : null;
    const response = await next();
    const ctype = response.headers.get('content-type') ?? '';
    if (!ctype.includes('text/html')) return response;
    // Private links: never indexed, whatever their state.
    let rewriter = new HTMLRewriter()
      .on('meta[name="robots"]', new MetaTagSetter('name', 'robots', 'noindex, nofollow'))
      .on('link[rel="alternate"]', new AlternateSetter(null))
      .on('html', new HtmlLangSetter(SEO_COPY[locale].htmlLang));
    if (preview) {
      const copy = PREVIEW_COPY[locale];
      const open = preview.status === 'pending' || preview.status === 'accepted';
      const title = copy.title(preview.cafeName);
      const when = open ? formatPreviewTime(preview, locale) : null;
      const description = open
        ? [when, preview.cafeAddress, copy.cta].filter(Boolean).join(' · ')
        : copy.closed;
      const pageUrl = `${url.origin}${url.pathname}`;
      const image = `${url.origin}/api/og/proposal/${id}?l=${locale}&v=${preview.scheduledAt}-${preview.cafeIndex}-${preview.status}`;
      rewriter = rewriter
        .on('title', new TitleSetter(`${title} — ACoffee`))
        .on('meta[name="description"]', new MetaTagSetter('name', 'description', description))
        .on('meta[property="og:title"]', new MetaTagSetter('property', 'og:title', title))
        .on('meta[property="og:description"]', new MetaTagSetter('property', 'og:description', description))
        .on('meta[property="og:url"]', new MetaTagSetter('property', 'og:url', pageUrl))
        .on('meta[property="og:locale"]', new MetaTagSetter('property', 'og:locale', SEO_COPY[locale].ogLocale))
        .on('meta[property="og:image"]', new MetaTagSetter('property', 'og:image', image))
        .on('meta[property="og:image:alt"]', new MetaTagSetter('property', 'og:image:alt', title))
        .on('meta[name="twitter:card"]', new MetaTagSetter('name', 'twitter:card', 'summary_large_image'))
        .on('meta[name="twitter:title"]', new MetaTagSetter('name', 'twitter:title', title))
        .on('meta[name="twitter:description"]', new MetaTagSetter('name', 'twitter:description', description))
        .on('meta[name="twitter:image"]', new MetaTagSetter('name', 'twitter:image', image))
        .on('meta[name="twitter:image:alt"]', new MetaTagSetter('name', 'twitter:image:alt', title))
        .on('link[rel="canonical"]', new CanonicalSetter(pageUrl));
    }
    return rewriter.transform(response);
  }

  const match = url.pathname.match(USERNAME_RE);
  if (!match) return next();
  const username = match[2];
  if (RESERVED_USERNAMES.has(username)) return next();

  /* Per-IP throttle on the D1 enrichment lookup. Without it, a scraper
   * hitting /aaa /aab /aac... (any 3-30 char path that isn't reserved)
   * triggers a D1 user SELECT + visited_shops scan per request — 17k+
   * queries to walk the username space. We cap at 60 enrichment lookups
   * per IP per 10 minutes; over the limit, we just serve the static SPA
   * page without injected OG tags (real users with their own profile
   * never approach this rate even with multiple reloads). */
  const rl = await rateLimit(
    request,
    { waitUntil: context.waitUntil.bind(context) },
    { bucket: 'mw-og-lookup', limit: 60, windowSec: 600 },
  );
  if (!rl.ok) return next();

  let profile: ProfileForOg | null = null;
  try {
    profile = await fetchProfileForOg(env, username);
  } catch (e) {
    console.error('[og] profile fetch failed', e);
    return next();
  }
  if (!profile) return next();

  const og = buildOgValues(profile, url);
  const response = await next();
  // Only transform HTML responses — if the static handler 404'd we shouldn't
  // touch the body shape.
  const ctype = response.headers.get('content-type') ?? '';
  if (!ctype.includes('text/html')) return response;

  const rewriter = new HTMLRewriter()
    .on('title', new TitleSetter(og.title))
    .on('meta[name="description"]', new MetaTagSetter('name', 'description', og.description))
    .on('meta[property="og:title"]', new MetaTagSetter('property', 'og:title', og.title))
    .on('meta[property="og:description"]', new MetaTagSetter('property', 'og:description', og.description))
    .on('meta[property="og:url"]', new MetaTagSetter('property', 'og:url', og.url))
    .on('meta[property="og:image"]', new MetaTagSetter('property', 'og:image', og.image))
    .on('meta[name="twitter:card"]', new MetaTagSetter('name', 'twitter:card', 'summary_large_image'))
    .on('meta[name="twitter:title"]', new MetaTagSetter('name', 'twitter:title', og.title))
    .on('meta[name="twitter:description"]', new MetaTagSetter('name', 'twitter:description', og.description))
    .on('meta[name="twitter:image"]', new MetaTagSetter('name', 'twitter:image', og.image))
    // The static shell's canonical is the homepage, which told Google
    // every profile was a duplicate of `/`. One URL per profile, no
    // per-locale alternates (the content is the user's, not translated).
    .on('link[rel="canonical"]', new CanonicalSetter(og.url))
    .on('link[rel="alternate"]', new AlternateSetter(null));

  return rewriter.transform(response);
};
