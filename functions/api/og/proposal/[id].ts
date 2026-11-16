import { ImageResponse, loadGoogleFont } from 'workers-og';
import type { AuthEnv } from '../../../_lib/auth';
import { jsonError } from '../../../_lib/jsonError';
import {
  PREVIEW_COPY,
  formatPreviewTime,
  loadProposalPreview,
  type PreviewLocale,
} from '../../../_lib/proposalPreview';
import { rateLimit, rateLimitResponse } from '../../../_lib/rateLimit';

/**
 * 1200×630 link-preview card for a proposal: "Coffee here?", the café,
 * the time and its address. Chat apps fetch this once per share, so the
 * render is edge-cached per (proposal, locale, version); the middleware
 * puts the scheduled time + café index in `v` so a shifted time or a
 * "next café" gets a fresh image.
 *
 * Text is set in Noto Sans JP / SC loaded per request with only the
 * glyphs the card uses — satori's bundled font has no CJK, so Japanese
 * and Chinese café names would otherwise render as boxes.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s: string, n: number): string {
  const chars = [...s];
  return chars.length <= n ? s : chars.slice(0, n - 1).join('').trimEnd() + '…';
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ params, request, env, waitUntil }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  const url = new URL(request.url);
  const locale: PreviewLocale = (['en', 'ja', 'zh'] as const).find((l) => l === url.searchParams.get('l')) ?? 'en';

  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const rl = await rateLimit(request, { waitUntil }, { bucket: 'og-proposal', limit: 60, windowSec: 600 });
  if (!rl.ok) return rateLimitResponse(rl);

  const preview = await loadProposalPreview(env, id);
  if (!preview) return jsonError('Not found', 404);

  const copy = PREVIEW_COPY[locale];
  const open = preview.status === 'pending' || preview.status === 'accepted';
  const name = truncate(preview.cafeName, 34);
  const when = open ? formatPreviewTime(preview, locale) : null;
  const address = open ? truncate(preview.cafeAddress, 70) : copy.closed;
  const nameSize = [...name].length > 20 ? 64 : 80;

  const html = `
<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:64px 80px;background:#faf7f2;color:#2c1810;font-family:'Card';">
  <div style="display:flex;flex-direction:column;">
    <span style="font-size:26px;font-weight:700;letter-spacing:3px;color:#6b5848;">${escapeHtml(copy.eyebrow)}</span>
    <span style="font-size:${nameSize}px;font-weight:700;line-height:1.1;margin-top:22px;">${escapeHtml(name)}</span>
    ${when ? `<span style="font-size:40px;font-weight:500;margin-top:28px;color:#2c1810;">${escapeHtml(when)}</span>` : ''}
    <span style="font-size:28px;font-weight:500;margin-top:18px;color:#6b5848;">${escapeHtml(address)}</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:34px;font-weight:700;">ACoffee</span>
    <span style="display:flex;padding:16px 34px;border-radius:999px;background:#2c1810;color:#fffaf4;font-size:26px;font-weight:700;">acoffee.com</span>
  </div>
</div>`;

  const text = [copy.eyebrow, name, when ?? '', address, 'ACoffee', 'acoffee.com', '…·'].join('');
  const family = locale === 'zh' ? 'Noto Sans SC' : 'Noto Sans JP';
  let fonts;
  try {
    const [bold, medium] = await Promise.all([
      loadGoogleFont({ family, weight: 700, text }),
      loadGoogleFont({ family, weight: 500, text }),
    ]);
    fonts = [
      { name: 'Card', data: bold, weight: 700 as const, style: 'normal' as const },
      { name: 'Card', data: medium, weight: 500 as const, style: 'normal' as const },
    ];
  } catch (e) {
    // Font CDN hiccup: fall back to the bundled font rather than failing
    // the preview (CJK glyphs may be missing in this case).
    console.warn('[og/proposal] font load failed', e);
  }

  // Whitespace between tags becomes flex children in satori's HTML parser
  // and gets spread out by space-between, pushing content off its edges.
  const markup = html.replace(/>\s+</g, '><').trim();
  const image = new ImageResponse(markup, { width: 1200, height: 630, ...(fonts ? { fonts } : {}) });
  const body = await image.arrayBuffer();
  const response = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      // Versioned URL (?v=), so a long cache is safe; short-circuits bots
      // that re-fetch on every view.
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  });
  waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
};
